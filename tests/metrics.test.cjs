const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/studio/metrics.js');
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('known ROC, average precision, and Brier example', () => {
  const m = M.metrics([0, 0, 1, 1], [0.1, 0.4, 0.35, 0.8], 0.4);
  near(m.auc, 0.75); near(m.ap, 5 / 6); near(m.brier, 0.158125);
  assert.equal(m.tp, 1); assert.equal(m.fp, 1); assert.equal(m.tn, 1); assert.equal(m.fn, 1);
  near(m.netBenefit, 1 / 12);
});
test('ties receive half credit in ROC and grouped precision updates', () => {
  const m = M.metrics([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5]);
  near(m.auc, 0.5); near(m.ap, 0.5); near(m.brier, 0.25);
  assert.equal(m.fit.slope, null); near(m.fit.citl, 0);
});
test('perfect, reversed, and boundary predictions', () => {
  const y = [0, 0, 1, 1];
  const perfect = M.metrics(y, [0, 0, 1, 1]);
  near(perfect.auc, 1); near(perfect.brier, 0); near(perfect.ap, 1);
  assert.ok(Number.isFinite(perfect.logLoss));
  near(M.metrics(y, [1, 1, 0, 0]).auc, 0);
});
test('absent outcome classes have explicit undefined estimates', () => {
  const m = M.metrics([0, 0, 0], [0.1, 0.2, 0.3], 0.5);
  assert.equal(m.auc, null); assert.equal(m.ap, null); assert.equal(m.sensitivity, null);
  assert.equal(m.ppv, null); assert.equal(m.fit.slope, null);
  near(m.specificity, 1); near(m.npv, 1);
});
test('calibration bins retain all rows and handle probability 1', () => {
  const bins = M.calibration([0, 1, 1, 0], [0, 0.2, 1, 0.2], 5);
  assert.equal(bins.reduce((s, b) => s + b.n, 0), 4);
  assert.equal(bins.length, 3); near(bins[1].y, 0.5); near(bins[2].x, 1);
  bins.forEach(b => { assert.ok(b.ci[0] >= 0 && b.ci[1] <= 1); assert.ok(b.ci[0] <= b.y && b.ci[1] >= b.y); });
  const ci = M.wilson(5, 10); near(ci[0], 0.236593090512564, 1e-12); near(ci[1], 0.763406909487436, 1e-12);
});
test('threshold equality is classified as positive; net benefit matches counts', () => {
  const c = M.confusion([0, 1, 1], [0.2, 0.2, 0.8], 0.2);
  assert.equal(c.tp, 2); assert.equal(c.fp, 1);
  near(c.netBenefit, (2 - 0.25) / 3);
  const d = M.decisionCurve([0, 1], [0.1, 0.8], 0.2, 0.6, 2);
  near(d.model[0].y, 0.5); near(d.all[0].y, 0.375); near(d.none[0].y, 0);
});
test('synthetic examples are reproducible and preserve the intended mechanisms', () => {
  const standard = M.generateCohort('standard'), rare = M.generateCohort('rare'), shift = M.generateCohort('shift');
  assert.deepEqual(standard, M.generateCohort('standard'));
  const y = standard.rows.map(r => r.outcome);
  near(M.metrics(y, standard.rows.map(r => r.predictions[0])).auc, M.metrics(y, standard.rows.map(r => r.predictions[2])).auc);
  assert.ok(rare.rows.reduce((s, r) => s + r.outcome, 0) < y.reduce((s, v) => s + v, 0));
  assert.ok(shift.rows.reduce((s, r) => s + r.outcome, 0) > y.reduce((s, v) => s + v, 0));
  assert.deepEqual(shift.rows.map(r => r.predictions), standard.rows.map(r => r.predictions));
});
test('CSV supports BOM, CRLF, quotes, commas, and scientific notation', () => {
  const c = M.parseCSV('\uFEFFoutcome,p_score,group,unused\r\n0,1e-1,"A, B",ignore\r\n1,0.8,"A ""quoted"" label",ignore\r\n');
  assert.equal(c.rows.length, 2); near(c.rows[0].predictions[0], 0.1);
  assert.equal(c.rows[0].group, 'A, B'); assert.equal(c.rows[1].group, 'A "quoted" label'); assert.equal(c.ignored, 1);
  assert.equal(Object.keys(c.rows[0]).length, 3);
});
test('CSV rejects missing values, malformed fields, duplicate headers, and out-of-range scores', () => {
  for (const csv of [
    'outcome,p_a\n0,\n1,0.8', 'outcome,p_a\n0,1.01\n1,0.8', 'outcome,p_a\n0,NaN\n1,0.8',
    'outcome,p_a\n0,0x1\n1,0.8', 'outcome,p_a\n2,0.1\n1,0.8', 'outcome,p_a,p_a\n0,.1,.2\n1,.8,.7',
    'outcome,p_a\n0,0.1,extra\n1,0.8', 'outcome,p_a\n0,"0.1\n1,0.8', 'outcome,p_a\n0,0.1\n0,0.8'
  ]) assert.throws(() => M.parseCSV(csv));
});
test('synthetic CSV round trip preserves probability precision and outcomes', () => {
  const c = M.generateCohort('standard', 200, 79), back = M.parseCSV(M.exportCohort(c));
  assert.deepEqual(back.rows, c.rows);
});
test('spreadsheet formula prefixes are neutralized for text, not numeric results', () => {
  const csv = M.toCSV([['=1+1', '+cmd', '-bad', '@text', -0.125, 'a,"b']]);
  assert.ok(csv.includes('"\'=1+1"')); assert.ok(csv.includes('"-0.125"')); assert.ok(csv.includes('"a,""b"'));
});
test('invalid numerical inputs fail explicitly', () => {
  assert.throws(() => M.metrics([0, 1], [0.2])); assert.throws(() => M.metrics([0, 2], [0.2, 0.4]));
  assert.throws(() => M.metrics([0, 1], [NaN, 0.4])); assert.throws(() => M.metrics([0, 1], [-0.1, 0.4]));
  assert.throws(() => M.confusion([0, 1], [0.2, 0.4], 1));
});
test('paired bootstrap is seeded and gives exact zero difference for identical scores', async () => {
  const c = M.generateCohort('standard', 80, 14); c.rows.forEach(r => { r.predictions[1] = r.predictions[0]; });
  const a = await M.bootstrap(c.rows, c.models, 200, 7), b = await M.bootstrap(c.rows, c.models, 200, 7);
  assert.deepEqual(a, b); assert.equal(a.valid, 200); assert.deepEqual(a.models[1].deltaAuc, [0, 0]);
  a.models.forEach(m => ['auc', 'ap', 'brier'].forEach(k => assert.ok(m[k][0] <= m[k][1])));
});
test('bootstrap cancellation prevents stale results', async () => {
  const c = M.generateCohort('standard', 40, 11);
  assert.equal(await M.bootstrap(c.rows, c.models, 200, 1, () => {}, () => true), null);
});
test('single-class bootstrap draws are counted, not assigned fabricated AUC', async () => {
  const rows = [{ outcome: 0, predictions: [0.1] }, { outcome: 1, predictions: [0.9] }];
  const r = await M.bootstrap(rows, ['model'], 200, 8);
  assert.ok(r.skipped > 0); assert.equal(r.valid + r.skipped, 200);
});
