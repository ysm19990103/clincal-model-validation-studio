// Reproduce aggregate results from a CSV without opening the app.
const fs = require('node:fs');
const M = require('../public/studio/metrics.js');
async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) throw new Error('Usage: node scripts/analyze.cjs input.csv [threshold=0.2] [bootstrap=0]');
  const threshold = args[1] === undefined ? 0.2 : Number(args[1]);
  const reps = args[2] === undefined ? 0 : Number(args[2]);
  if (!(threshold > 0 && threshold < 1)) throw new Error('Threshold must be between 0 and 1.');
  if (![0, 200, 500, 1000].includes(reps)) throw new Error('Bootstrap count must be 0, 200, 500, or 1000.');
  const c = M.parseCSV(fs.readFileSync(args[0], 'utf8')), y = c.rows.map(r => r.outcome);
  const result = { softwareVersion: M.VERSION, n: c.rows.length, threshold, riskBins: 10, models: c.models.map((name,i) => ({ name, ...M.metrics(y,c.rows.map(r=>r.predictions[i]),threshold,10) })) };
  if (reps) result.intervals = await M.bootstrap(c.rows, c.models, reps, 2026);
  console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
