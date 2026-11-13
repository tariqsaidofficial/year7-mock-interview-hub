import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;

function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = code;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log('LOCAL MOCK ONLY: simulated feedback; no Firebase or OpenRouter calls.');
start(process.execPath, ['scripts/mock-api.mjs']);
start(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve', '--port', process.env['MOCK_UI_PORT'] || '3000', '--proxy-config', 'proxy.mock.json']);
