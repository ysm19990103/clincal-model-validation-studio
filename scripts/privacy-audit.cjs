// A deliberately limited static check. Never prints matched secret values.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const patterns = [
  ['credential-like string', /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16})\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential in URL', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
  ['JWT-like credential', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/]
];
const issues = []; let checked = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.openai', 'node_modules', 'artifacts', '.local', '__pycache__', '.sites-runtime', '.wrangler', 'dist', '.vinext', '.next', '.agents', '.codex'].includes(item.name)) continue;
    const file = path.join(dir, item.name), rel = path.relative(root, file);
    if (item.isDirectory()) { walk(file); continue; }
    if (/^\.env(?:\.|$)/.test(item.name) || /\.(?:pem|key|dcm|xlsx|parquet|sqlite|db)$/i.test(item.name)) issues.push({ file: rel, kind: 'Sensitive configuration or data file' });
    const text = fs.readFileSync(file, 'utf8'); checked++;
    for (const [kind, pattern] of patterns) if (pattern.test(text)) issues.push({ file: rel, kind });
    if (rel.startsWith('public/') && /(?:fetch|XMLHttpRequest|WebSocket)\s*\(\s*['"]https?:/i.test(text)) issues.push({file:rel,kind:'Unexpected external network target'});
  }
}
walk(root);
console.log(JSON.stringify({ filesChecked: checked, issueCount: issues.length, issues }, null, 2));
process.exitCode = issues.length ? 1 : 0;
