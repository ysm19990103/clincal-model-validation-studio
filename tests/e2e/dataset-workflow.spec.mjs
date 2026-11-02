import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fictionalCSV } from './fictional.mjs';
import Prep from '../../public/studio/preprocess.mjs';
import Metrics from '../../public/studio/metrics.js';

const datasetURL = '/studio/index.html#view=datasets';
async function selectCSV(page, testInfo, csv = fictionalCSV(), name = 'fictional.csv') {
  const file = testInfo.outputPath(name);
  await writeFile(file, csv);
  // Exercise the label click and the native filechooser event, not just DOM injection.
  const chosen = page.waitForEvent('filechooser');
  await page.getByText('Choose a CSV file', { exact: true }).click();
  await (await chosen).setFiles(file);
  await expect(page.locator('#dataset-file')).toBeEnabled();
  return file;
}
async function configure(page) {
  await page.locator('#outcome-column').selectOption('0');
  await expect(page.locator('#outcome-summary')).toContainText('response → categorical · 2 categories · 2 missing');
  await expect(page.getByLabel('Include response as predictor', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Type for response', { exact: true })).toHaveCount(0);
  await page.locator('#event-category').selectOption('1');
  await page.getByLabel('Type for measurement', { exact: true }).selectOption('numeric');
  await page.getByLabel('Type for arm', { exact: true }).selectOption('categorical');
  await page.getByLabel('Include case_code as predictor', { exact: true }).uncheck();
  await page.locator('#holdout-fraction').selectOption('0.3');
  await page.locator('#split-seed').fill('73');
  await page.locator('#remove-duplicates').check();
  await page.locator('#run-preprocess').click();
  await expect(page.locator('#prep-results')).toBeVisible();
  await expect(page.locator('#run-preprocess')).toBeEnabled();
  await expect(page.locator('#data-error')).toBeHidden();
}
async function download(page, trigger, testInfo, filename) {
  await trigger();
  await expect(page.locator('#download-link')).toHaveAttribute('download', filename);
  const pending = page.waitForEvent('download');
  await page.locator('#download-link').click();
  const item = await pending;
  expect(item.suggestedFilename()).toBe(filename);
  expect(await item.failure()).toBeNull();
  const destination = testInfo.outputPath(filename);
  await item.saveAs(destination);
  return readFile(destination);
}
async function exportFile(page, id, testInfo, filename) {
  return download(page, async () => { await page.locator('#export-button').click(); await page.locator(id).click(); }, testInfo, filename);
}
function unzipStored(bytes) {
  const files = {};
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extra;
    files[bytes.toString('utf8', offset + 30, offset + 30 + nameLength)] = bytes.subarray(start, start + size).toString('utf8');
    offset = start + size;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
  return files;
}
test('external CSV to saved preparation, fresh-session reopening, fitting and every result download', async ({ page, browser }, testInfo) => {
  const pageErrors = [], external = [], writes = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(process.env.CMVS_E2E_BASE_URL).origin) external.push(request.url());
    if (/\/api\/datasets/.test(request.url()) && request.method() !== 'GET') writes.push(request);
  });
  await page.goto(datasetURL);
  await expect(page.locator('#storage-status')).toHaveText('SIGN IN TO SAVE');
  await selectCSV(page, testInfo);
  await expect(page.locator('#file-status')).toHaveText('121 rows · 6 columns · on this device');
  await configure(page);
  expect(writes).toHaveLength(0);
  await expect(page.locator('#save-dataset')).toBeDisabled();
  const before = JSON.parse(await download(page, () => page.locator('#download-recipe').click(), testInfo, 'preprocessing-recipe.json'));
  expect(before.outcome.classes).toEqual(['01', '1']);
  expect(before.outcome.type).toBe('categorical');
  expect(before.audit).toMatchObject({ inputRows: 121, retained: 118, training: 82, holdout: 36, droppedOutcome: 2, duplicatesRemoved: 1 });
  expect(before.audit.columns.find(c => c.name === 'measurement')).toMatchObject({ invalid: 1, missing: 1, imputed: 2 });
  expect(before.features).not.toContain('case_code');
  expect(before.recipe.transforms.map(t => t.type)).toEqual(['numeric', 'categorical']);
  await page.locator('#dataset-signin').click();
  await expect(page.locator('#storage-status')).toHaveText('PRIVATE DATABASE');
  // Sign-in navigates, so deliberately select the external file again.
  await selectCSV(page, testInfo);
  await configure(page);
  await page.locator('#dataset-name').fill('Fictional E2E dataset');
  const savedResponse = page.waitForResponse(r => r.url().endsWith('/api/datasets') && r.request().method() === 'POST');
  await page.locator('#save-dataset').click();
  const response = await savedResponse;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await expect(page.locator('#save-prepared')).toBeEnabled();
  const prepResponse = page.waitForResponse(r => r.url().endsWith('/api/datasets/' + saved.id) && r.request().method() === 'PUT');
  await page.locator('#save-prepared').click();
  expect((await prepResponse).status()).toBe(200);
  await expect(page.locator('#save-prepared')).toBeEnabled();
  const stored = await (await page.request.get('/api/datasets/' + saved.id)).json();
  // Blob.text() decodes UTF-8 and consumes a leading BOM; all decoded content
  // (including CRLF, missing tokens and original category labels) is preserved.
  expect(stored.csv).toBe(new TextDecoder().decode(new TextEncoder().encode(fictionalCSV())));
  expect(stored.config).toEqual(before.config);
  expect(stored.revision).toBe(2);

  // No cookies or local storage are carried into this independent browser context.
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    reopened.on('pageerror', error => pageErrors.push(error.message));
    reopened.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(process.env.CMVS_E2E_BASE_URL).origin) external.push(request.url());
    });
    await reopened.goto(process.env.CMVS_E2E_BASE_URL + datasetURL);
    await expect(reopened.locator('#storage-status')).toHaveText('SIGN IN TO SAVE');
    expect((await fresh.request.get(process.env.CMVS_E2E_BASE_URL + '/api/datasets/' + saved.id)).status()).toBe(401);
    await reopened.locator('#dataset-signin').click();
    await expect(reopened.locator('#storage-status')).toHaveText('PRIVATE DATABASE');
    await reopened.locator(`[data-open="${saved.id}"]`).click();
    await expect(reopened.locator('#prep-results')).toBeVisible();
    await expect(reopened.locator('#run-preprocess')).toBeEnabled();
    await expect(reopened.locator('#outcome-column')).toBeEnabled();
    await expect(reopened.locator('#outcome-column')).toHaveValue('0');
    await expect(reopened.getByLabel('Type for measurement', { exact: true })).toHaveValue('numeric');
    await expect(reopened.getByLabel('Type for arm', { exact: true })).toHaveValue('categorical');
    await expect(reopened.getByLabel('Include case_code as predictor', { exact: true })).not.toBeChecked();
    await expect(reopened.locator('#split-seed')).toHaveValue('73');
    await expect(reopened.locator('#holdout-fraction')).toHaveValue('0.3');
    await expect(reopened.locator('#remove-duplicates')).toBeChecked();
    const recipe = JSON.parse(await download(reopened, () => reopened.locator('#download-recipe').click(), testInfo, 'preprocessing-recipe.json'));
    expect(recipe).toEqual(before);
    const preparedBytes = await download(reopened, () => reopened.locator('#download-prepared').click(), testInfo, 'prepared-dataset.csv');
    const exported = Prep.parse(preparedBytes.toString());
    expect(exported.rows).toHaveLength(118);
    expect(exported.rows.filter(r => r[1] === 'holdout')).toHaveLength(36);
    expect(exported.columns).toEqual(['source_record', 'partition', 'response', ...recipe.features]);
    expect(new Set(exported.rows.map(r => r[2]))).toEqual(new Set(['01', '1']));
    expect(exported.rows.every(r => r.slice(3).every(v => Number.isFinite(Number(v))))).toBe(true);
    const expectedPrepared = Prep.preprocess(Prep.parse(fictionalCSV()), before.config);
    expect(exported.rows.map(r => r.slice(3).map(Number))).toEqual(expectedPrepared.rows.map(r => r.x));
    await reopened.locator('#fit-baseline').click();
    await expect(reopened.locator('#view-overview')).toBeVisible();
    await expect(reopened.locator('#dataset-size')).toContainText('36 observations');
    await expect(reopened.locator('#share-button')).toBeDisabled();
    const metricsBytes = await exportFile(reopened, '#export-metrics', testInfo, 'model-validation-metrics.csv');
    const metrics = Prep.parse(metricsBytes.toString());
    expect(metrics.rows).toHaveLength(2);
    const fitted = Prep.fitBaseline(expectedPrepared);
    const expected = Metrics.metrics(fitted.cohort.rows.map(r => r.outcome), fitted.cohort.rows.map(r => r.predictions[0]));
    expect(Number(metrics.rows[0][metrics.columns.indexOf('auroc')])).toBeCloseTo(expected.auc, 10);
    expect(Number(metrics.rows[0][metrics.columns.indexOf('brier_score')])).toBeCloseTo(expected.brier, 10);
    const settings = JSON.parse(await exportFile(reopened, '#export-settings', testInfo, 'validation-settings.json'));
    expect(settings).toMatchObject({ source: 'uploaded', inputDataIncluded: false, n: 36, preprocessing: { trainingN: 82, holdoutN: 36, splitSeed: 73 } });
    const bundle = unzipStored(await exportFile(reopened, '#export-report', testInfo, 'model-validation-report.zip'));
    expect(Object.keys(bundle).sort()).toEqual(['analysis-settings.json', 'model-validation-report.html']);
    expect(JSON.parse(bundle['analysis-settings.json'])).toEqual(settings);
    expect(bundle['model-validation-report.html']).toContain('36 observations');
    expect(bundle['model-validation-report.html']).toContain(expected.auc.toFixed(3));
    expect(bundle['model-validation-report.html']).not.toContain('fictional-row-');
    expect(bundle['model-validation-report.html']).not.toMatch(/<script[\s>]/i);
    await reopened.screenshot({ path: testInfo.outputPath('held-out-validation.png'), fullPage: true });
  } finally { await fresh.close(); }
  expect(pageErrors).toEqual([]);
  expect(external).toEqual([]);
});

test('choosing the same external file again replaces a synthetic dataset', async ({ page }, testInfo) => {
  await page.goto(datasetURL);
  await selectCSV(page, testInfo);
  await expect(page.locator('#file-status')).toContainText('121 rows');
  await page.locator('#prep-demo').click();
  await expect(page.locator('#file-status')).toContainText('240 rows');
  const chosen = page.waitForEvent('filechooser');
  await page.getByText('Choose a CSV file', { exact: true }).click();
  await (await chosen).setFiles(testInfo.outputPath('fictional.csv'));
  await expect(page.locator('#file-status')).toContainText('121 rows');
  await expect(page.locator('#dataset-name')).toHaveValue('fictional');
});

test('malformed import, multicategory guard, stale saves and anonymous access fail safely', async ({ page }, testInfo) => {
  await page.goto(datasetURL);
  await selectCSV(page, testInfo, 'outcome,x\n1,"unclosed\n0,2', 'malformed.csv');
  await expect(page.locator('#data-error')).toContainText('not closed');
  await expect(page.locator('#file-status')).toHaveText('No file selected');
  await selectCSV(page, testInfo);
  await configure(page);
  await page.locator('#outcome-column').selectOption('2');
  await expect(page.locator('#prep-results')).toBeHidden();
  await page.locator('#run-preprocess').click();
  await expect(page.locator('#prep-results')).toBeVisible();
  await expect(page.locator('#fit-baseline')).toBeDisabled();
  await expect(page.locator('#event-field')).toBeHidden();
  await page.locator('#dataset-signin').click();
  await expect(page.locator('#storage-status')).toHaveText('PRIVATE DATABASE');
  await selectCSV(page, testInfo);
  await configure(page);
  const created = page.waitForResponse(r => r.url().endsWith('/api/datasets') && r.request().method() === 'POST');
  await page.locator('#save-dataset').click();
  const record = await (await created).json();
  await expect(page.locator('#save-prepared')).toBeEnabled();
  const other = await page.context().newPage();
  await other.goto(datasetURL);
  await other.locator(`[data-open="${record.id}"]`).click();
  await configure(other);
  await other.locator('#save-prepared').click();
  await expect(other.locator('#toast')).toContainText('settings and prepared rows saved');
  await page.locator('#save-prepared').click();
  await expect(page.locator('#data-error')).toContainText('changed in another tab');
  await expect(page.locator('#save-prepared')).toBeEnabled();
  await other.close();
  const forged = await page.request.put('/api/datasets/' + record.id, {
    headers: { origin: 'https://example.invalid' }, data: { revision: 2, archived: true },
  });
  expect(forged.status()).toBe(403);
  // Archiving is reversible and must preserve the saved preparation.
  await page.locator(`[data-open="${record.id}"]`).click();
  await expect(page.locator('#prep-results')).toBeVisible();
  await expect(page.locator('#run-preprocess')).toBeEnabled();
  await page.locator(`[data-archive="${record.id}"]`).click();
  await expect(page.locator(`[data-open="${record.id}"]`)).toHaveCount(0);
  await page.locator('#show-archived').check();
  await expect(page.locator(`[data-archive="${record.id}"]`)).toHaveText('Restore');
  await page.locator(`[data-archive="${record.id}"]`).click();
  await page.locator(`[data-open="${record.id}"]`).click();
  await expect(page.locator('#prep-results')).toBeVisible();
  await expect(page.locator('#split-seed')).toHaveValue('73');
});

test('local sign-in strips forged identity headers and rejects cross-site sign-in', async ({ page }) => {
  const spoofed = await page.request.get('/api/session', { headers: {
    'oai-authenticated-user-id': 'fictional-forgery',
    'oai-authenticated-user-email': 'forgery@example.invalid',
  } });
  expect(await spoofed.json()).toEqual({ authenticated: false });
  const blocked = await page.request.get('/signin-with-chatgpt', {
    headers: { origin: 'https://example.invalid', 'sec-fetch-site': 'cross-site' }, maxRedirects: 0,
  });
  expect(blocked.status()).toBe(403);
  expect((await page.request.get('/api/datasets')).status()).toBe(401);
});

test('synthetic example and template downloads remain available', async ({ page }, testInfo) => {
  await page.goto('/studio/index.html');
  const data = Prep.parse((await exportFile(page, '#export-data', testInfo, 'synthetic-validation-data.csv')).toString());
  expect(data.rows).toHaveLength(800);
  await page.locator('#navigation [data-view="methods"]').click();
  const template = Prep.parse((await download(page, () => page.locator('#download-template').click(), testInfo, 'synthetic-validation-example.csv')).toString());
  expect(template.rows).toHaveLength(200);
  expect(template.columns).toEqual(data.columns);
});

test('standalone HTML supports local import, fitting and downloads without a database', async ({ page }, testInfo) => {
  const requests = [], errors = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(path.join(process.env.CMVS_E2E_WORKSPACE, 'artifacts/Clinical_Model_Validation_Studio.html')).href + '#view=datasets');
  await expect(page.locator('#storage-status')).toHaveText('LOCAL PREPARATION');
  await selectCSV(page, testInfo);
  await configure(page);
  await expect(page.locator('#save-dataset')).toBeDisabled();
  const recipe = JSON.parse(await download(page, () => page.locator('#download-recipe').click(), testInfo, 'preprocessing-recipe.json'));
  expect(recipe.audit.retained).toBe(118);
  await page.locator('#fit-baseline').click();
  await expect(page.locator('#view-overview')).toBeVisible();
  const report = unzipStored(await exportFile(page, '#export-report', testInfo, 'model-validation-report.zip'));
  expect(report['model-validation-report.html']).toContain('36 observations');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
