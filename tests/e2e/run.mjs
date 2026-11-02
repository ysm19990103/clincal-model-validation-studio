// Run against an isolated copy and disposable local D1 state, never a deployment.
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workspace = await mkdtemp(path.join(tmpdir(), 'cmvs-e2e-'));
const env = { ...process.env, SITES_RUNTIME_ROOT: path.join(workspace, '.sites-runtime'),
  WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false' };
let server;
const children = new Set();
function command(args, cwd = workspace, extra = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit' });
  children.add(child);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { children.delete(child); code === 0 ? resolve() : reject(Error(`Command exited ${code}: ${args[0]}`)); });
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  for (const child of children) child.kill(signal);
  server?.kill(signal);
});
try {
  // Allowlist source only: no .env, credentials, previous uploads or D1 state.
  for (const entry of ['app', 'db', 'drizzle', 'lib', 'public', 'scripts', 'worker',
    'package.json', 'vite.config.ts', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs']) {
    await cp(path.join(root, entry), path.join(workspace, entry), { recursive: true });
  }
  await mkdir(path.join(workspace, '.openai'));
  await writeFile(path.join(workspace, '.openai/hosting.json'), JSON.stringify({ d1: 'DB', r2: null }));
  await symlink(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
  // Use the same local binding as vite.config.ts. No remote flag or credentials.
  await writeFile(path.join(workspace, 'wrangler.json'), JSON.stringify({
    name: 'cmvs-e2e', compatibility_date: '2026-05-15',
    d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }],
  }));
  for (const migration of (await readdir(path.join(workspace, 'drizzle'))).filter(f => f.endsWith('.sql')).sort()) {
    await command(['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js',
      'd1', 'execute', 'DB', '--local', '--config', 'wrangler.json', '--persist-to', '.wrangler/state',
      '--file', `drizzle/${migration}`]);
  }
  await command(['scripts/build-standalone.cjs']);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const baseURL = `http://127.0.0.1:${port}`;
  let output = '';
  server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 90000;
  while (true) {
    if (server.exitCode !== null || Date.now() > deadline) throw Error(`Local server did not start.\n${output}`);
    try {
      const response = await fetch(`${baseURL}/api/session`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).authenticated === false) break;
    } catch { /* Wait for compilation and local workerd startup. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.log('Isolated loopback server and local D1 ready.');
  await command(['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/e2e/playwright.config.mjs',
    ...process.argv.slice(2)], root, { CMVS_E2E_BASE_URL: baseURL, CMVS_E2E_WORKSPACE: workspace });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const child of children) await stop(child);
  await stop(server);
  await rm(workspace, { recursive: true, force: true });
}
