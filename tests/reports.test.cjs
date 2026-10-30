const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/studio/metrics.js');
const { buildReport, zipFiles } = require('../public/studio/reports.js');

function inputs() {
  const cohort = M.generateCohort('standard', 200, 42);
  const results = cohort.models.map((_,i)=>M.metrics(cohort.rows.map(r=>r.outcome),cohort.rows.map(r=>r.predictions[i])));
  return { cohort,results,focus:0,intervals:null,settings:{version:M.VERSION,displayedModelIndexes:[0,1,2],threshold:0.2,riskBins:10,inputDataIncluded:false},charts:[['Test chart','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>']],subgroupHTML:'<tr><td>Group A</td></tr>',generatedAt:'2026-01-01T00:00:00.000Z' };
}
test('report records settings, numerical estimates, and limitations without raw rows',()=>{
  const x=inputs(), html=buildReport(x);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.endsWith('</body></html>'));
  assert.ok(html.includes(x.results[0].auc.toFixed(3)));
  assert.ok(html.includes('200 observations'));
  assert.ok(html.includes('Point estimates only'));
  assert.ok(html.includes('inputDataIncluded'));
  assert.ok(!html.includes(JSON.stringify(x.cohort.rows[0].predictions)));
  assert.ok(!/<script[\s>]/i.test(html));
});
test('imported model labels are escaped in HTML and in settings',()=>{
  const x=inputs();x.cohort.models[0]='<img src=x onerror=alert(1)>';x.settings.models=x.cohort.models;
  const html=buildReport(x);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
});
test('reports include the bootstrap counts and intervals when calculated',async()=>{
  const x=inputs();x.intervals=await M.bootstrap(x.cohort.rows,x.cohort.models,200,2026);
  const html=buildReport(x);
  assert.ok(html.includes('200 valid paired bootstrap resamples'));
  assert.ok(html.includes(x.intervals.models[0].auc[0].toFixed(3)));
  assert.ok(!html.includes('Point estimates only; bootstrap'));
});
test('report ZIP has consistent records and forbids path traversal',()=>{
  const bytes=zipFiles([{name:'report.html',data:'<p>Report</p>'},{name:'settings.json',data:'{}'}]);
  const view=new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(view.getUint16(bytes.length-12,true),2);
  assert.throws(()=>zipFiles([{name:'../bad.html',data:'bad'}]));
});
