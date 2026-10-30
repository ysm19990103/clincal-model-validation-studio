/* Validation UI. Dataset persistence is handled by the dataset workspace. */
(function () {
  'use strict';
  const M = window.CMVS, $ = id => document.getElementById(id);
  const COLORS = ['#28705d', '#6386bc', '#cf9562', '#9978ad', '#b56e76'];
  const VIEWS = ['overview', 'calibration', 'decisions', 'subgroups', 'learn', 'methods', 'datasets'];
  const state = { view: 'overview', scenario: 'standard', seed: 42, n: 800, threshold: 0.2, bins: 10, dcaMax: 0.6, focus: 0, ranking: 'roc', active: new Set([0, 1, 2]), cohort: null, results: [], intervals: null, bootstrapToken: 0, bootstrapRunning: false, reps: 500 };
  let chartId = 0, toastTimer, exportURL = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, digits = 3) => v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits);
  const pct = (v, digits = 1) => v === null || v === undefined || !Number.isFinite(v) ? '—' : (v * 100).toFixed(digits) + '%';
  const intervalText = (v, digits = 3) => !v || v[0] === null ? '' : `${num(v[0], digits)}–${num(v[1], digits)}`;
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (Object.hasOwn(M.SCENARIOS, q.get('example'))) state.scenario = q.get('example');
    if (VIEWS.includes(q.get('view'))) state.view = q.get('view');
    const bounded = (name, min, max) => q.has(name) && Number.isFinite(Number(q.get(name))) && Number(q.get(name)) >= min && Number(q.get(name)) <= max;
    if (bounded('seed', 1, 999999)) state.seed = Math.floor(Number(q.get('seed')));
    if ([200, 800, 2000].includes(Number(q.get('n')))) state.n = Number(q.get('n'));
    if (bounded('threshold', 1, 90)) state.threshold = Math.round(Number(q.get('threshold'))) / 100;
    if ([5, 10, 15].includes(Number(q.get('bins')))) state.bins = Number(q.get('bins'));
    if ([0.3, 0.6, 0.9].includes(Number(q.get('range')))) state.dcaMax = Number(q.get('range'));
    state.threshold = Math.min(state.threshold, state.dcaMax);
    if (bounded('focus', 0, 2)) state.focus = Math.floor(Number(q.get('focus')));
    if (q.get('ranking') === 'pr') state.ranking = 'pr';
    if ([200, 500, 1000].includes(Number(q.get('reps')))) state.reps = Number(q.get('reps'));
    if (q.has('models')) { const ids = q.get('models').split(',').map(Number).filter(i => [0, 1, 2].includes(i)); if (ids.length) state.active = new Set(ids); }
    state.active.add(state.focus);
  }
  function exampleURL() {
    const q = new URLSearchParams({ example: state.scenario, seed: state.seed, n: state.n, view: state.view, threshold: Math.round(state.threshold * 100), bins: state.bins, range: state.dcaMax, focus: state.focus, ranking: state.ranking, reps: state.reps, models: [...state.active].sort().join(',') });
    const u = new URL(location.href); u.hash = q.toString(); return u.href;
  }
  function setView(view) {
    if (!VIEWS.includes(view)) return;
    const changed = state.view !== view;
    document.querySelector('.dataset-bar').hidden = view === 'datasets';
    document.querySelector('.context-row').hidden = view === 'datasets';
    document.querySelector('.workspace-controls').hidden = view === 'datasets';
    $('export-button').hidden = view === 'datasets';
    $('global-warning').hidden = view === 'datasets' || !$('global-warning').textContent;
    state.view = view;
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'view-' + view; });
    document.querySelectorAll('#navigation [data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); active ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'); });
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function recompute() {
    const y = state.cohort.rows.map(r => r.outcome);
    state.results = state.cohort.models.map((_, m) => M.metrics(y, state.cohort.rows.map(r => r.predictions[m]), state.threshold, state.bins));
  }
  function setCohort(cohort, preserve = false) {
    state.bootstrapToken++; state.bootstrapRunning = false; state.intervals = null;
    state.cohort = cohort;
    if (!preserve) { state.focus = 0; state.active = new Set(cohort.models.map((_, i) => i)); }
    const customOption = $('scenario').querySelector('option[value=uploaded]'); if (customOption) customOption.remove();
    if (cohort.source !== 'synthetic') { const opt = document.createElement('option'); opt.value = 'uploaded'; opt.textContent = cohort.name; $('scenario').appendChild(opt); $('scenario').value = 'uploaded'; } else $('scenario').value = state.scenario;
    $('focus-model').innerHTML = cohort.models.map((m, i) => `<option value="${i}">${esc(m)}</option>`).join('');
    recompute(); render();
  }
  function newExample(scenario, preserve = false) {
    state.scenario = scenario; setCohort(M.generateCohort(scenario, state.n, state.seed), preserve);
  }
  function drawChart(series, options = {}) {
    const width = 540, height = options.height || 295, left = 62, right = 23, top = 25, bottom = 48;
    const pw = width - left - right, ph = height - top - bottom;
    const xmin = options.xmin ?? 0, xmax = options.xmax ?? 1, ymin = options.ymin ?? 0, ymax = options.ymax ?? 1;
    const X = x => left + (x - xmin) / (xmax - xmin) * pw, Y = y => top + ph - (y - ymin) / (ymax - ymin) * ph;
    const fmtX = options.formatX || (v => (v * 100).toFixed(0) + '%'), fmtY = options.formatY || (v => (v * 100).toFixed(0) + '%');
    const id = 'plot-' + (++chartId);
    let s = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc" xmlns="http://www.w3.org/2000/svg"><title id="${id}-title">${esc(options.title || 'Model performance')}</title><desc id="${id}-desc">${esc(options.description || 'Curves compare the models selected above. Detailed numeric results appear in the tables.')}</desc><defs><clipPath id="${id}"><rect x="${left}" y="${top - 3}" width="${pw + 1}" height="${ph + 3}"/></clipPath></defs>`;
    const yTicks = options.yTicks || Array.from({length:6}, (_,i)=>ymin+(ymax-ymin)*i/5);
    yTicks.forEach(y => { s += `<line x1="${left}" x2="${left + pw}" y1="${Y(y)}" y2="${Y(y)}" stroke="#e9eee5" stroke-width=".8" stroke-dasharray="3 4"/><text x="${left - 11}" y="${Y(y) + 4}" text-anchor="end" font-size="10" fill="#8d9786">${esc(fmtY(y))}</text>`; });
    for (let i = 0; i <= 5; i++) {
      const x = xmin + (xmax - xmin) * i / 5;
      s += `<text x="${X(x)}" y="${top + ph + 21}" text-anchor="middle" font-size="10" fill="#8d9786">${esc(fmtX(x))}</text>`;
    }
    s += `<line x1="${left}" x2="${left + pw}" y1="${top + ph}" y2="${top + ph}" stroke="#d9e0d4"/><text x="${left + pw / 2}" y="${height - 6}" text-anchor="middle" font-size="11" fill="#7d8a75">${esc(options.xlabel || '')}</text><text transform="translate(15 ${top + ph / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#7d8a75">${esc(options.ylabel || '')}</text><g clip-path="url(#${id})">`;
    if (options.diagonal) s += `<path d="M${X(0)},${Y(0)}L${X(1)},${Y(1)}" stroke="#aebba5" stroke-width="1.2" stroke-dasharray="5 5" fill="none"/>`;
    if (options.horizontal !== undefined) s += `<path d="M${X(xmin)},${Y(options.horizontal)}L${X(xmax)},${Y(options.horizontal)}" stroke="#b6bfae" stroke-width="1.2" stroke-dasharray="5 5" fill="none"/>`;
    if (options.vertical !== undefined) s += `<path d="M${X(options.vertical)},${Y(ymin)}L${X(options.vertical)},${Y(ymax)}" stroke="#c2c9ba" stroke-width="1.2" stroke-dasharray="3 4"/>`;
    series.forEach(curve => {
      const points = curve.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!points.length) return;
      let path = '';
      points.forEach((p, i) => { if (!i) path = `M${X(p.x)},${Y(p.y)}`; else if (curve.step) path += `V${Y(p.y)}H${X(p.x)}`; else path += `L${X(p.x)},${Y(p.y)}`; });
      s += `<path d="${path}" stroke="${curve.color}" stroke-width="${curve.thin ? 1.25 : 2.3}" fill="none" ${curve.dashed ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round"><title>${esc(curve.name)}</title></path>`;
      if (curve.dots) points.forEach(p => {
        if (curve.intervals && p.ci) s += `<path d="M${X(p.x)},${Y(p.ci[0])}V${Y(p.ci[1])}M${X(p.x)-3},${Y(p.ci[0])}H${X(p.x)+3}M${X(p.x)-3},${Y(p.ci[1])}H${X(p.x)+3}" stroke="${curve.color}" stroke-width="1" opacity=".55"/>`;
        s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${curve.intervals ? 4.5 : 3}" fill="${curve.color}" stroke="white" stroke-width="1.2"><title>${esc(curve.name)}: predicted ${pct(p.x)}, observed ${pct(p.y)}${p.n ? ', n=' + p.n : ''}</title></circle>`;
      });
    });
    return s + '</g></svg>';
  }
  function selectedSeries(key, extras = {}) {
    return state.results.flatMap((m, i) => state.active.has(i) ? [{ name: state.cohort.models[i], points: m[key], color: COLORS[i], ...extras }] : []);
  }
  function card(label, value, note, icon, featured = false) {
    return `<article class="metric-card${featured ? ' featured' : ''}"><div class="metric-label">${label}<span class="metric-icon" aria-hidden="true">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
  }
  function render() {
    const c = state.cohort, m = state.results[state.focus], y = c.rows.map(r => r.outcome), p = c.rows.map(r => r.predictions[state.focus]);
    $('source-badge').textContent = c.source === 'synthetic' ? 'SYNTHETIC' : 'YOUR DATA';
    $('dataset-size').textContent = `${c.rows.length.toLocaleString()} observations · ${m.events} events`;
    $('context-description').textContent = c.detail;
    $('focus-model').value = state.focus;
    $('model-toggles').innerHTML = c.models.map((name, i) => `<label class="legend-toggle" style="--model-color:${COLORS[i]}"><input type="checkbox" data-model="${i}" ${state.active.has(i) ? 'checked' : ''} ${i === state.focus ? 'disabled' : ''}><span>${esc(name)}</span></label>`).join('');
    $('share-button').disabled = c.source !== 'synthetic';
    $('share-button').title = c.source === 'synthetic' ? 'Copy link to this example' : 'Sharing links is available only for built-in examples';
    $('export-data').disabled = c.source !== 'synthetic';
    $('sample-size').value = state.n; $('random-seed').value = state.seed;
    $('sample-size').disabled = c.source !== 'synthetic'; $('random-seed').disabled = c.source !== 'synthetic'; $('regenerate').disabled = c.source !== 'synthetic';
    $('threshold').max = Math.round(state.dcaMax * 100); $('threshold').value = Math.round(state.threshold * 100); $('threshold-value').textContent = pct(state.threshold, 0);
    $('dca-range').value = state.dcaMax; $('bin-count').value = state.bins; $('bootstrap-reps').value = state.reps;
    const warnings = [];
    if (c.scenario === 'leakage') warnings.push('The leaked score uses the observed outcome. Its apparent performance is invalid for predicting new outcomes.');
    if (m.events < 20 || m.n - m.events < 20) warnings.push('One outcome class has fewer than 20 observations. Interpret estimates and bootstrap intervals with particular care.');
    if (c.source === 'local' && c.ignored) warnings.push(`${c.ignored} unused column(s) were ignored. No rows were silently removed.`);
    $('global-warning').hidden = !warnings.length; $('global-warning').textContent = warnings.join(' ');
    const ci = state.intervals?.models[state.focus];
    $('metric-cards').innerHTML = card('Observations', m.n.toLocaleString(), `${m.events} events · ${pct(m.prevalence)} event frequency`, '⊞') + card('AUROC', num(m.auc), ci ? `95% CI ${intervalText(ci.auc) || 'unavailable'}` : 'Ranking across all thresholds', '↗', true) + card('Brier score', num(m.brier), ci ? `95% CI ${intervalText(ci.brier) || 'unavailable'}` : 'Mean squared error · lower is better', '◎') + card('Average precision', num(m.ap), `Event frequency reference: ${num(m.prevalence)}`, '⌁');
    document.querySelectorAll('[data-ranking]').forEach(b => { const active = b.dataset.ranking === state.ranking; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', active); });
    const isROC = state.ranking === 'roc';
    $('ranking-caption').textContent = isROC ? 'Discrimination across decision thresholds.' : 'The balance between finding events and false alarms.';
    $('ranking-chart').innerHTML = drawChart(selectedSeries(isROC ? 'roc' : 'pr', { step: !isROC }), { title: isROC ? 'Receiver operating characteristic curves' : 'Precision–recall curves', diagonal: isROC, horizontal: isROC ? undefined : m.prevalence, xlabel: isROC ? 'False-positive rate (1 − specificity)' : 'Recall (sensitivity)', ylabel: isROC ? 'True-positive rate (sensitivity)' : 'Precision (positive predictive value)' });
    $('ranking-foot').textContent = isROC ? 'The dashed diagonal is the chance-ranking reference.' : `The dashed line is the event frequency (${pct(m.prevalence)}). Summary scores use average precision.`;
    $('calibration-chart').innerHTML = drawChart(selectedSeries('calibration', { dots: true }), { title: 'Calibration curves', diagonal: true, xlabel: 'Mean predicted probability', ylabel: 'Observed outcome frequency' });
    $('comparison-body').innerHTML = state.results.map((v, i) => {
      const ci = state.intervals?.models[i];
      const cell = (k, value) => `${num(value)}${ci ? `<span class="ci">${intervalText(ci[k]) || 'Interval unavailable'}</span>` : ''}`;
      return `<tr class="${i === state.focus ? 'focus-row' : ''}"><td><span class="model-name"><span class="color-dot" style="background:${COLORS[i]}"></span>${esc(c.models[i])}</span></td><td>${cell('auc', v.auc)}</td><td>${cell('ap', v.ap)}</td><td>${cell('brier', v.brier)}</td><td>${num(v.fit.slope, 2)}${v.fit.reason ? '<span class="ci">Fit unavailable</span>' : ''}</td><td>${i === 0 ? 'Reference' : cell('deltaAuc', v.auc === null || state.results[0].auc === null ? null : v.auc - state.results[0].auc)}</td></tr>`;
    }).join('');
    $('run-bootstrap').disabled = state.bootstrapRunning;
    $('run-bootstrap').textContent = state.bootstrapRunning ? 'Calculating…' : state.intervals ? 'Recalculate intervals' : 'Calculate 95% intervals';
    if (!state.bootstrapRunning) $('bootstrap-status').textContent = state.intervals ? `${state.intervals.valid}/${state.intervals.reps} valid paired resamples · 95% percentile intervals · seed ${state.intervals.seed}${state.intervals.skipped ? ` · ${state.intervals.skipped} single-class samples skipped` : ''}` : `Intervals use ${state.reps} paired bootstrap resamples of fixed predictions.`;
    $('overview-interpretation').innerHTML = `<span class="insight-icon" aria-hidden="true">◇</span><div><strong>${c.source === 'synthetic' && c.scenario === 'standard' ? 'The same ranking can tell a different story.' : 'Read the measures together.'}</strong><p>${c.source === 'synthetic' && c.scenario === 'standard' ? 'The clinical and overconfident scores have identical AUROC by construction. Their probability errors and decision consequences differ. Open Calibration or Decision curves to see why.' : 'AUROC describes ranking; the Brier score combines probability accuracy and discrimination. Calibration and net benefit add different information. No single number establishes that a model is ready for use.'}</p></div>`;
    renderCalibration(m); renderDecisions(y, p, m); renderSubgroups(); renderData(m);
    setView(state.view);
  }
  function renderCalibration(m) {
    $('calibration-cards').innerHTML = card('Mean predicted risk', pct(m.meanPrediction), 'Average of the supplied probabilities', '◌') + card('Observed frequency', pct(m.prevalence), `${m.events} events among ${m.n} observations`, '◉') + card('Calibration-in-the-large', num(m.fit.citl, 2), 'Ideal: 0 · intercept-only offset model', '↔') + card('Calibration slope', num(m.fit.slope, 2), 'Ideal: 1 · logistic recalibration', '⌁', true);
    $('calibration-detail-chart').innerHTML = drawChart([{ name: state.cohort.models[state.focus], points: m.calibration, color: COLORS[state.focus], dots: true, intervals: true }], { title: 'Calibration with within-bin Wilson intervals', diagonal: true, xlabel: 'Mean predicted probability', ylabel: 'Observed outcome frequency', height: 330 });
    $('calibration-reading').innerHTML = `<h3>Above or below the diagonal</h3><p>Points above the line mean outcomes occurred more often than predicted in that bin. Points below it mean the predicted risk was higher than the observed frequency.</p><h3>Overall level</h3><p>Observed / expected events: <strong>${num(m.oe, 2)}</strong>. The calibration-in-the-large estimate is <strong>${num(m.fit.citl, 2)}</strong>. A positive value indicates an upward adjustment in log-odds would be needed overall.</p><h3>Spread of the probabilities</h3><p>A slope below 1 suggests predictions are too spread out in this sample; a slope above 1 suggests they are too compressed. This is a diagnostic estimate, not a new validated model.</p>${m.fit.reason ? `<p class="notice warning">${esc(m.fit.reason)}</p>` : ''}`;
    $('calibration-table').innerHTML = m.calibration.map(b => `<tr><td>${pct(b.x)}</td><td>${pct(b.y)}</td><td>${pct(b.ci[0])}–${pct(b.ci[1])}</td><td>${b.n}</td><td>${b.events}</td></tr>`).join('');
  }
  function renderDecisions(y, p, m) {
    const series = []; let defaults;
    state.cohort.models.forEach((name, i) => {
      if (!state.active.has(i)) return;
      const d = M.decisionCurve(y, state.cohort.rows.map(r => r.predictions[i]), 0.01, state.dcaMax, 80); defaults = d;
      series.push({ name, points: d.model.map(p => ({ x: p.x, y: p.y * 100 })), color: COLORS[i] });
    });
    series.push({ name: 'Act on everyone', points: defaults.all.map(p => ({ x: p.x, y: p.y * 100 })), color: '#8e9b80', dashed: true, thin: true }, { name: 'Act on no one', points: defaults.none, color: '#a5afa0', thin: true });
    const ymin = -Math.max(5, Math.ceil(m.prevalence * 25 / 5) * 5), ymax = Math.max(5, Math.ceil(m.prevalence * 110 / 5) * 5);
    const tickStep = ymax - ymin > 50 ? 10 : 5, yTicks = [];
    for(let v = Math.ceil(ymin/tickStep)*tickStep; v<=ymax; v+=tickStep) yTicks.push(v);
    $('decision-chart').innerHTML = drawChart(series, { title: 'Decision curves: net benefit per 100 observations', xmin: 0.01, xmax: state.dcaMax, ymin, ymax, yTicks, formatY: v => v.toFixed(0), xlabel: 'Decision threshold probability', ylabel: 'Net benefit per 100', vertical: state.threshold, height: 330 });
    $('decision-chart').nextElementSibling.innerHTML = `<span class="key-line" style="color:#8e9b80"></span>Dashed: act on everyone. Gray horizontal: act on no one. Values below ${num(ymin, 1)} are outside the plot; calculations retain them.`;
    $('decision-model-name').textContent = state.cohort.models[state.focus];
    $('confusion-matrix').innerHTML = '<div class="confusion">' + [['True positives', m.tp, false], ['False positives', m.fp, true], ['False negatives', m.fn, true], ['True negatives', m.tn, false]].map(([label, v, error]) => `<div class="confusion-cell${error ? ' error' : ''}"><span>${label}</span><strong>${v}</strong></div>`).join('') + '</div>';
    $('threshold-stats').innerHTML = [['Sensitivity', m.sensitivity], ['Specificity', m.specificity], ['Precision', m.ppv], ['Negative predictive value', m.npv], ['Accuracy', m.accuracy], ['Flagged for action', m.positiveRate]].map(([label, v]) => `<div class="stat-pair"><span>${label}</span><strong>${pct(v)}</strong></div>`).join('');
    const all = m.prevalence - (1 - m.prevalence) * state.threshold / (1 - state.threshold);
    $('decision-reading').innerHTML = `<span class="insight-icon" aria-hidden="true">↗</span><div><strong>At a ${pct(state.threshold, 0)} threshold, net benefit is ${num(m.netBenefit * 100, 2)} per 100 observations.</strong><p>Acting on everyone gives ${num(all * 100, 2)}; acting on no one gives 0. The relative false-positive weight is ${num(state.threshold / (1 - state.threshold), 2)}. These are point estimates on this sample, not estimates of lives saved.</p></div>`;
  }
  function renderSubgroups() {
    const groups = [...new Set(state.cohort.rows.map(r => r.group))].sort();
    const values = groups.map(group => {
      const rows = state.cohort.rows.filter(r => r.group === group);
      return { group, ...M.metrics(rows.map(r => r.outcome), rows.map(r => r.predictions[state.focus]), state.threshold, state.bins) };
    });
    $('subgroup-caption').textContent = `${state.cohort.models[state.focus]} · threshold ${pct(state.threshold, 0)}`;
    $('subgroup-table').innerHTML = values.map(v => `<tr><td>${esc(v.group)}</td><td>${v.n} / ${v.events}</td><td>${pct(v.prevalence)}</td><td>${num(v.auc)}</td><td>${num(v.brier)}</td><td>${pct(v.sensitivity)}</td><td>${pct(v.specificity)}</td><td>${num(v.oe, 2)}</td></tr>`).join('');
    const height = 70 + groups.length * 64, width = 900, left = 155, available = 610;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Predicted and observed event frequency by group" xmlns="http://www.w3.org/2000/svg"><text x="20" y="20" font-size="12" fill="#4c6242">Mean predicted risk and observed frequency</text><rect x="560" y="10" width="10" height="10" fill="#b7cbb0"/><text x="577" y="19" font-size="10" fill="#7a886e">Predicted</text><rect x="665" y="10" width="10" height="10" fill="#3d7256"/><text x="682" y="19" font-size="10" fill="#7a886e">Observed</text>`;
    values.forEach((v, i) => {
      const y = 46 + i * 64;
      const label = v.group.length > 23 ? v.group.slice(0, 22) + '…' : v.group;
      svg += `<text x="20" y="${y+17}" font-size="11" fill="#607152"><title>${esc(v.group)}</title>${esc(label)}</text><rect x="${left}" y="${y}" width="${available}" height="14" fill="#f4f7f0" rx="2"/><rect x="${left}" y="${y}" width="${available*v.meanPrediction}" height="14" fill="#b7cbb0" rx="2"/><text x="${left+available*v.meanPrediction+8}" y="${y+11}" font-size="10" fill="#78876a">${pct(v.meanPrediction)}</text><rect x="${left}" y="${y+20}" width="${available}" height="14" fill="#f4f7f0" rx="2"/><rect x="${left}" y="${y+20}" width="${available*v.prevalence}" height="14" fill="#3d7256" rx="2"/><text x="${left+available*v.prevalence+8}" y="${y+31}" font-size="10" fill="#527044">${pct(v.prevalence)}</text>`;
    });
    $('subgroup-chart').innerHTML = svg + '</svg>';
    const small = values.filter(v => v.events < 20 || v.n - v.events < 20);
    $('subgroup-notice').textContent = groups.length === 1 ? 'Only one group is present. Add a group column to compare meaningful subgroups.' : `${small.length ? `${small.length} group(s) have fewer than 20 events or non-events. ` : ''}Missing group labels are shown as “Unspecified”. AUROC, sensitivity, or specificity may be unavailable when a group lacks the relevant outcome class. O/E means observed divided by expected events.`;
  }
  function renderData(m) {
    const c = state.cohort;
    $('dataset-details').innerHTML = [['Source', c.source === 'synthetic' ? 'Built-in synthetic example' : 'User dataset · held-out evaluation'], ['Observations / events', `${m.n} / ${m.events}`], ['Models', c.models.length], ['Risk bins', state.bins + ' equal-width bins'], ['Decision threshold', pct(state.threshold, 0)], ['Random seed', c.seed ?? 'Not applicable'], ['Missing outcome rows excluded', c.preparation?.droppedOutcome ?? 0], ['Software', 'v' + M.VERSION]].map(([a, b]) => `<div class="data-pair"><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  }
  async function runBootstrap() {
    const token = ++state.bootstrapToken; state.bootstrapRunning = true; state.intervals = null; render();
    try {
      const result = await M.bootstrap(state.cohort.rows, state.cohort.models, state.reps, 2026, progress => {
        if (token === state.bootstrapToken) $('bootstrap-status').textContent = `Calculating paired bootstrap intervals… ${Math.round(progress*100)}%`;
      }, () => token !== state.bootstrapToken);
      if (token !== state.bootstrapToken) return;
      state.intervals = result; state.bootstrapRunning = false; render(); toast('Bootstrap intervals are ready.');
    } catch (e) { if (token === state.bootstrapToken) { state.bootstrapRunning = false; render(); toast('Could not calculate intervals: ' + e.message); } }
  }
  function download(filename, content, type = 'text/plain') {
    if (exportURL) URL.revokeObjectURL(exportURL);
    exportURL = URL.createObjectURL(new Blob([content], {type}));
    const a = $('download-link'); a.href = exportURL; a.download = filename;
    a.textContent = 'Save ' + filename; $('download-ready').hidden = false;
    $('export-menu').hidden = true; $('export-button').setAttribute('aria-expanded', 'false');
    $('download-ready').scrollIntoView({block:'nearest'});
  }
  function settings() {
    return { application: 'Clinical Model Validation Studio', version: M.VERSION, source: state.cohort.source, example: state.cohort.source === 'synthetic' ? state.scenario : null, seed: state.cohort.seed, n: state.cohort.rows.length, models: state.cohort.models, focusModel: state.cohort.models[state.focus], displayedModelIndexes: [...state.active].sort(), threshold: state.threshold, riskBins: state.bins, decisionCurveRange: [0.01, state.dcaMax], bootstrap: state.intervals ? { requested: state.intervals.reps, valid: state.intervals.valid, skipped: state.intervals.skipped, seed: state.intervals.seed, method: state.intervals.method } : null, assumptions: ['Binary outcome at a common horizon', 'Independent observations for row bootstrap', 'Predictions are held fixed', 'Validation design and leakage are not verified'], preprocessing: state.cohort.preparation ?? null, inputDataIncluded: false };
  }
  function exportMetrics() {
    const headers = ['model','n','events','event_frequency','auroc','auroc_ci_low','auroc_ci_high','average_precision','ap_ci_low','ap_ci_high','brier_score','brier_ci_low','brier_ci_high','log_loss','calibration_intercept','calibration_slope','calibration_in_the_large','observed_expected_ratio','decision_threshold','sensitivity','specificity','precision','npv','net_benefit','delta_auroc_vs_first','delta_ci_low','delta_ci_high'];
    const rows = state.results.map((m, i) => { const c = state.intervals?.models[i]; return [state.cohort.models[i], m.n, m.events, m.prevalence, m.auc, ...(c?.auc || [null, null]), m.ap, ...(c?.ap || [null, null]), m.brier, ...(c?.brier || [null, null]), m.logLoss, m.fit.intercept, m.fit.slope, m.fit.citl, m.oe, state.threshold, m.sensitivity, m.specificity, m.ppv, m.npv, m.netBenefit, m.auc === null || state.results[0].auc === null ? null : m.auc - state.results[0].auc, ...(c?.deltaAuc || [null, null])]; });
    download('model-validation-metrics.csv', M.toCSV([headers, ...rows]), 'text/csv;charset=utf-8');
  }
  function exportReport() {
    const report=window.CMVSReports.buildReport({cohort:state.cohort,results:state.results,settings:settings(),focus:state.focus,intervals:state.intervals,
      charts:[['Ranking',$('ranking-chart').innerHTML],['Calibration: displayed models',$('calibration-chart').innerHTML],['Calibration: focus model with Wilson intervals',$('calibration-detail-chart').innerHTML],['Decision curves',$('decision-chart').innerHTML]],
      subgroupHTML:$('subgroup-table').innerHTML});
    const bundle=window.CMVSReports.zipFiles([{name:'model-validation-report.html',data:report},{name:'analysis-settings.json',data:JSON.stringify(settings(),null,2)}]);
    download('model-validation-report.zip',bundle,'application/zip');
  }
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]'); if (v) { e.preventDefault(); setView(v.dataset.view); }
    const example = e.target.closest('[data-example]'); if (example) { newExample(example.dataset.example); if (state.scenario === 'standard') { state.focus = 2; render(); setView('calibration'); } else setView('overview'); }
    const ranking = e.target.closest('[data-ranking]'); if (ranking) { state.ranking = ranking.dataset.ranking; render(); }
    if (!e.target.closest('.export-wrap')) { $('export-menu').hidden = true; $('export-button').setAttribute('aria-expanded','false'); }
  });
  $('model-toggles').addEventListener('change', e => { const i = Number(e.target.dataset.model); e.target.checked ? state.active.add(i) : state.active.delete(i); render(); });
  $('focus-model').addEventListener('change', e => { state.focus = Number(e.target.value); state.active.add(state.focus); render(); });
  $('scenario').addEventListener('change', e => { if (e.target.value !== 'uploaded') newExample(e.target.value); });
  $('threshold').addEventListener('input', e => { state.threshold = Number(e.target.value) / 100; recompute(); render(); });
  $('bin-count').addEventListener('change', e => { state.bins = Number(e.target.value); recompute(); render(); });
  $('dca-range').addEventListener('change', e => { state.dcaMax = Number(e.target.value); state.threshold = Math.min(state.threshold, state.dcaMax); recompute(); render(); });
  $('run-bootstrap').addEventListener('click', runBootstrap);
  $('bootstrap-reps').addEventListener('change', e => { state.reps = Number(e.target.value); state.bootstrapToken++; state.bootstrapRunning = false; state.intervals = null; render(); });
  $('regenerate').addEventListener('click', () => { const seed = Number($('random-seed').value); if (!Number.isInteger(seed) || seed < 1 || seed > 999999) return toast('Use a whole-number seed from 1 to 999,999.'); state.seed = seed; state.n = Number($('sample-size').value); newExample(state.scenario); toast('Example regenerated.'); });
  $('share-button').addEventListener('click', async () => {
    if (state.cohort.source !== 'synthetic') return;
    const url = exampleURL();
    try { history.replaceState(null, '', url); } catch (_) { /* portable file mode */ }
    if (location.protocol === 'file:') { download('example-settings.json', JSON.stringify(settings(),null,2), 'application/json'); toast('For a portable copy, share the app file and these settings.'); return; }
    try { await navigator.clipboard.writeText(url); toast('Example link copied. It contains settings only.'); }
    catch (_) { toast('Example settings are now in the address bar. Copy the URL to share.'); }
  });
  $('export-button').addEventListener('click', () => { const open = $('export-menu').hidden; $('export-menu').hidden = !open; $('export-button').setAttribute('aria-expanded', open); });
  $('dismiss-download').addEventListener('click',()=>{$('download-ready').hidden=true;});
  $('export-report').addEventListener('click', exportReport); $('export-metrics').addEventListener('click', exportMetrics);
  $('export-settings').addEventListener('click', () => download('validation-settings.json', JSON.stringify(settings(),null,2), 'application/json'));
  $('export-data').addEventListener('click', () => { if (state.cohort.source === 'synthetic') download('synthetic-validation-data.csv', M.exportCohort(state.cohort), 'text/csv;charset=utf-8'); });
  const template = () => download('synthetic-validation-example.csv', M.exportCohort(M.generateCohort('standard', 200, 42)), 'text/csv;charset=utf-8');
  $('download-template').addEventListener('click', template);
  $('print-report').addEventListener('click', () => { $('export-menu').hidden = true; window.print(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('export-menu').hidden = true; $('export-button').setAttribute('aria-expanded','false'); } });
  window.addEventListener('hashchange', () => { readHash(); newExample(state.scenario, true); });
  window.Studio = { setCohort, setView, toast, download, reset: () => newExample(state.scenario) };
  readHash(); newExample(state.scenario, true);
})();
