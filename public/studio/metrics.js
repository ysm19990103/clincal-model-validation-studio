/* Clinical Model Validation Studio. MIT License. No runtime dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CMVS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '2.0.0';
  const EPS = 1e-12;
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
  const logit = p => Math.log(clamp(p, EPS, 1 - EPS) / (1 - clamp(p, EPS, 1 - EPS)));
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(random) {
    return Math.sqrt(-2 * Math.log(Math.max(random(), EPS))) * Math.cos(2 * Math.PI * random());
  }
  const SCENARIOS = {
    standard: { name: 'A typical validation cohort', detail: 'Three synthetic scores on the same fictional cohort. The clinical model follows the data-generating risk; the simpler model uses less information. The overconfident model preserves the clinical model’s ranking but stretches its probabilities.' },
    rare: { name: 'An uncommon outcome', detail: 'A lower baseline risk makes positive outcomes less common. Compare average precision with the outcome frequency, and look beyond overall accuracy.' },
    shift: { name: 'A change in baseline risk', detail: 'The outcome is more common than the prediction formula assumes. Ranking can remain useful while predicted probabilities underestimate risk.' },
    leakage: { name: 'Deliberate outcome leakage', detail: 'An invalid example: one score is built using the observed outcome. Its impressive performance is a consequence of leakage. These are deliberately contaminated scores, not a trained model or a leakage-detection test.' }
  };
  function generateCohort(scenario = 'standard', n = 800, seed = 42) {
    if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error('Unknown example.');
    if (!Number.isInteger(n) || n < 40 || n > 5000) throw new Error('Choose 40–5,000 observations.');
    const random = rng(seed), rows = [];
    const base = scenario === 'rare' ? -3.6 : -1.3;
    for (let i = 0; i < n; i++) {
      const a = normal(random), b = normal(random);
      const group = random() < 0.5 ? 'Group A' : 'Group B';
      const linear = base + 1.05 * a + 0.75 * b + (group === 'Group B' ? 0.25 : -0.25);
      const actualRisk = sigmoid(linear + (scenario === 'shift' ? 1.05 : 0));
      const outcome = random() < actualRisk ? 1 : 0;
      const clinical = sigmoid(linear);
      const simple = sigmoid(base + 0.92 * a);
      const third = scenario === 'leakage' ? sigmoid(linear + 3.2 * (2 * outcome - 1)) : sigmoid(1.9 * linear);
      rows.push({ outcome, group, predictions: [clinical, simple, third] });
    }
    return { rows, models: ['Clinical model', 'Simpler model', scenario === 'leakage' ? 'Leaked score (invalid)' : 'Overconfident model'], source: 'synthetic', scenario, seed, n, ...SCENARIOS[scenario] };
  }
  function validate(y, p) {
    if (!Array.isArray(y) || !Array.isArray(p) || y.length !== p.length || !y.length) throw new Error('Outcomes and probabilities must be nonempty arrays of equal length.');
    if (y.some(v => v !== 0 && v !== 1)) throw new Error('Outcomes must be 0 or 1.');
    if (p.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('Probabilities must be finite values between 0 and 1.');
  }
  function discrimination(y, p) {
    const n = y.length, positives = y.reduce((s, v) => s + v, 0), negatives = n - positives;
    const order = p.map((v, i) => ({ p: v, y: y[i] })).sort((a, b) => b.p - a.p);
    let tp = 0, fp = 0, auc = 0, ap = 0, prevTPR = 0, prevFPR = 0;
    const roc = [{ x: 0, y: 0 }], pr = [{ x: 0, y: 1 }];
    for (let i = 0; i < n;) {
      let j = i;
      while (j < n && order[j].p === order[i].p) { tp += order[j].y; fp += 1 - order[j].y; j++; }
      const tpr = positives ? tp / positives : 0, fpr = negatives ? fp / negatives : 0;
      const precision = tp / (tp + fp);
      auc += (fpr - prevFPR) * (tpr + prevTPR) / 2;
      ap += (tpr - prevTPR) * precision;
      roc.push({ x: fpr, y: tpr }); pr.push({ x: tpr, y: precision });
      prevTPR = tpr; prevFPR = fpr; i = j;
    }
    return { auc: positives && negatives ? auc : null, ap: positives && negatives ? ap : null, roc, pr };
  }
  function confusion(y, p, threshold = 0.2) {
    if (!(threshold > 0 && threshold < 1)) throw new Error('The decision threshold must be between 0 and 1.');
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (let i = 0; i < y.length; i++) {
      if (p[i] >= threshold) y[i] ? tp++ : fp++;
      else y[i] ? fn++ : tn++;
    }
    const ratio = (a, b) => b ? a / b : null;
    return { tp, fp, tn, fn, sensitivity: ratio(tp, tp + fn), specificity: ratio(tn, tn + fp), ppv: ratio(tp, tp + fp), npv: ratio(tn, tn + fn), accuracy: (tp + tn) / y.length, positiveRate: (tp + fp) / y.length, netBenefit: (tp - fp * threshold / (1 - threshold)) / y.length };
  }
  function wilson(successes, n) {
    if (!n) return [null, null];
    const z = 1.959963984540054, p = successes / n, d = 1 + z * z / n;
    const mid = (p + z * z / (2 * n)) / d;
    const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  }
  function calibration(y, p, bins = 10) {
    const buckets = Array.from({ length: bins }, () => ({ n: 0, events: 0, sum: 0 }));
    p.forEach((v, i) => { const b = buckets[Math.min(bins - 1, Math.floor(v * bins))]; b.n++; b.events += y[i]; b.sum += v; });
    return buckets.filter(b => b.n).map(b => ({ x: b.sum / b.n, y: b.events / b.n, n: b.n, events: b.events, ci: wilson(b.events, b.n) }));
  }
  // Logistic recalibration is diagnostic only. It never replaces input scores.
  function calibrationFit(y, p) {
    if (y.every(v => v === y[0])) return { intercept: null, slope: null, citl: null, reason: 'Both outcome classes are needed.' };
    const x = p.map(logit), avg = mean(x);
    if (mean(x.map(v => (v - avg) ** 2)) < 1e-12) return { intercept: null, slope: null, citl: fitOffset(y, x), reason: 'Constant predictions: the calibration slope is not identifiable.' };
    let a = 0, b = 1, converged = false;
    for (let k = 0; k < 80; k++) {
      let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
      x.forEach((v, i) => {
        const q = sigmoid(a + b * v), w = q * (1 - q), r = y[i] - q;
        g0 += r; g1 += r * v; h00 += w; h01 += w * v; h11 += w * v * v;
      });
      const det = h00 * h11 - h01 * h01;
      if (!Number.isFinite(det) || det < 1e-10) break;
      let da = (h11 * g0 - h01 * g1) / det, db = (h00 * g1 - h01 * g0) / det;
      const scale = Math.max(1, Math.abs(da) / 5, Math.abs(db) / 5); da /= scale; db /= scale;
      a += da; b += db;
      if (Math.abs(a) > 30 || Math.abs(b) > 30) break;
      if (Math.abs(da) + Math.abs(db) < 1e-8) { converged = true; break; }
    }
    return { intercept: converged ? a : null, slope: converged ? b : null, citl: fitOffset(y, x), reason: converged ? null : 'Unstable or separated logistic fit; no slope estimate is reported.' };
  }
  function fitOffset(y, x) {
    let a = 0;
    for (let k = 0; k < 80; k++) {
      let g = 0, h = 0;
      x.forEach((v, i) => { const q = sigmoid(a + v); g += y[i] - q; h += q * (1 - q); });
      if (h < 1e-10) return null;
      const step = clamp(g / h, -5, 5); a += step;
      if (Math.abs(a) > 50) return null;
      if (Math.abs(step) < 1e-9) return a;
    }
    return null;
  }
  function metrics(y, p, threshold = 0.2, bins = 10, detailed = true) {
    validate(y, p);
    const d = discrimination(y, p), n = y.length, prevalence = mean(y);
    const brier = mean(p.map((v, i) => (v - y[i]) ** 2));
    const result = { n, events: y.reduce((s, v) => s + v, 0), prevalence, auc: d.auc, ap: d.ap, brier, meanPrediction: mean(p), oe: mean(p) > 0 ? prevalence / mean(p) : null, logLoss: -mean(p.map((v, i) => y[i] * Math.log(clamp(v, EPS, 1 - EPS)) + (1 - y[i]) * Math.log(clamp(1 - v, EPS, 1 - EPS)))) };
    if (detailed) Object.assign(result, confusion(y, p, threshold), { roc: d.roc, pr: d.pr, calibration: calibration(y, p, bins), fit: calibrationFit(y, p) });
    return result;
  }
  function decisionCurve(y, p, min = 0.01, max = 0.6, steps = 60) {
    const prevalence = mean(y), model = [], all = [], none = [];
    for (let i = 0; i <= steps; i++) {
      const x = min + (max - min) * i / steps;
      model.push({ x, y: confusion(y, p, x).netBenefit });
      all.push({ x, y: prevalence - (1 - prevalence) * x / (1 - x) }); none.push({ x, y: 0 });
    }
    return { model, all, none };
  }
  function quantile(a, q) {
    if (!a.length) return null;
    const sorted = [...a].sort((x, y) => x - y), h = (sorted.length - 1) * q, i = Math.floor(h);
    return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (h - i);
  }
  async function bootstrap(rows, models, reps = 500, seed = 2026, progress = () => {}, cancelled = () => false) {
    const random = rng(seed), names = ['auc', 'ap', 'brier'];
    const samples = models.map(() => Object.fromEntries(names.map(k => [k, []]))), deltas = models.map(() => []);
    let skipped = 0;
    for (let r = 0; r < reps; r++) {
      if (cancelled()) return null;
      const drawn = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
      const y = drawn.map(v => v.outcome);
      if (y.every(v => v === y[0])) { skipped++; continue; }
      const estimates = models.map((_, m) => metrics(y, drawn.map(v => v.predictions[m]), 0.2, 10, false));
      estimates.forEach((v, m) => { names.forEach(k => samples[m][k].push(v[k])); deltas[m].push(v.auc - estimates[0].auc); });
      if (r % 12 === 0) { progress((r + 1) / reps); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    progress(1);
    const valid = reps - skipped;
    const interval = a => valid >= 100 ? [quantile(a, 0.025), quantile(a, 0.975)] : [null, null];
    return { reps, valid, skipped, seed, method: 'Paired ordinary percentile bootstrap; fixed predictions; 95% intervals', models: samples.map((s, m) => ({ ...Object.fromEntries(names.map(k => [k, interval(s[k])])), deltaAuc: interval(deltas[m]) })) };
  }
  function parseCSV(text) {
    if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) throw new Error('Use a CSV smaller than 5 MB.');
    text = text.replace(/^\uFEFF/, '');
    const table = []; let row = [], cell = '', quoted = false, afterQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
        else cell += c;
      } else if (c === '"') {
        if (cell.trim() || afterQuote) throw new Error('Unexpected quote in CSV.');
        cell = ''; quoted = true;
      } else if (c === ',') { row.push(cell); cell = ''; afterQuote = false; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); if (row.some(v => v.trim())) table.push(row); row = []; cell = ''; afterQuote = false;
      } else { if (afterQuote && c.trim()) throw new Error('Unexpected text after a quoted field.'); cell += c; }
    }
    if (quoted) throw new Error('A quoted CSV field was not closed.');
    row.push(cell); if (row.some(v => v.trim())) table.push(row);
    if (table.length < 3) throw new Error('Include a header and at least two observations.');
    const headers = table[0].map(v => v.trim());
    if (new Set(headers).size !== headers.length) throw new Error('CSV column names must be unique.');
    const outcome = headers.indexOf('outcome'), group = headers.indexOf('group');
    const indexes = headers.map((v, i) => v.startsWith('p_') ? i : -1).filter(i => i >= 0);
    if (outcome < 0 || !indexes.length) throw new Error('Include outcome and at least one probability column beginning with p_.');
    if (indexes.length > 5) throw new Error('Compare up to five models at once.');
    if (indexes.some(i => headers[i].length < 3 || headers[i].length > 64)) throw new Error('Give each p_ column a short model name (1–62 characters after p_).');
    if (table.length - 1 > 5000) throw new Error('This browser edition supports up to 5,000 observations.');
    const rows = table.slice(1).map((r, i) => {
      if (r.length !== headers.length) throw new Error(`CSV record ${i + 2} has a different number of fields from the header.`);
      const value = r[outcome].trim();
      if (value !== '0' && value !== '1') throw new Error(`CSV record ${i + 2}: outcome must be 0 or 1; missing values are not dropped.`);
      const predictions = indexes.map(j => {
        const raw = r[j].trim(), v = Number(raw);
        if (!raw || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(v) || v < 0 || v > 1) throw new Error(`CSV record ${i + 2}: ${headers[j]} must be a probability from 0 to 1.`);
        return v;
      });
      const g = group >= 0 ? (r[group].trim() || 'Unspecified') : 'All observations';
      if (g.length > 80) throw new Error('Group labels must be no longer than 80 characters.');
      return { outcome: Number(value), group: g, predictions };
    });
    if (new Set(rows.map(r => r.group)).size > 12) throw new Error('Use up to 12 groups. Do not use patient IDs as group labels.');
    if (rows.every(r => r.outcome === rows[0].outcome)) throw new Error('The overall dataset must contain both outcome classes.');
    const ignored = headers.filter((_, i) => i !== outcome && i !== group && !indexes.includes(i)).length;
    return { rows, models: indexes.map(i => headers[i].slice(2).replace(/_/g, ' ')), source: 'local', scenario: null, seed: null, n: rows.length, name: 'Local CSV', detail: 'Predictions supplied by the user. Validation design, independence of observations, outcome definition, and sampling cannot be verified from this file.', ignored };
  }
  function csvCell(v) {
    let text = v === null || v === undefined ? '' : String(v);
    if (/^[\s]*[=+\-@]/.test(text) && typeof v !== 'number') text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function toCSV(rows) { return rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
  function exportCohort(cohort) {
    return toCSV([['outcome', ...cohort.models.map((_, i) => 'p_model_' + (i + 1)), 'group'], ...cohort.rows.map(r => [r.outcome, ...r.predictions, r.group])]);
  }
  return { VERSION, SCENARIOS, rng, sigmoid, logit, generateCohort, validate, discrimination, confusion, wilson, calibration, calibrationFit, metrics, decisionCurve, quantile, bootstrap, parseCSV, toCSV, exportCohort };
});
