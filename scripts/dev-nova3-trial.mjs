import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const envFile = join(root, '.env.local');
if (!existsSync(envFile)) throw new Error('Create the ignored .env.local file before starting the speech trial.');
process.loadEnvFile(envFile);
if (!process.env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY is missing from .env.local.');

const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
if (!existsSync(jar)) throw new Error('Firestore Emulator 1.22.0 is not installed. Run firebase emulators:download first.');
const cachedNpx = join(homedir(), '.npm/_npx');
const vercel = existsSync(join(root, 'node_modules/.bin/vercel'))
  ? join(root, 'node_modules/.bin/vercel')
  : existsSync(cachedNpx) ? readdirSync(cachedNpx).map((entry) => join(cachedNpx, entry, 'node_modules/.bin/vercel')).find(existsSync) : undefined;
if (!vercel) throw new Error('Vercel CLI is not cached. Install it locally before starting the trial.');

const port = 3002;
const emulatorPort = 8085;
const demoProject = 'demo-nova3-speech-lab';
const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: demoProject,
  FIRESTORE_DATABASE_ID: '(default)',
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${emulatorPort}`,
  INTERVIEW_RUN_ID: 'trial-nova3-local-20261113',
  INTERVIEW_RUN_OPEN: 'true',
  MAX_GUEST_SESSIONS: '4',
  MAX_GUEST_SESSIONS_PER_IP: '4',
  APP_ORIGIN: `http://localhost:${port}`,
  DEEPGRAM_LIVE_TRIAL: 'true',
  SESSION_PEPPER: process.env.SESSION_PEPPER || randomBytes(48).toString('hex'),
};
const children = [];
function start(command, args, stdio = 'inherit') {
  const child = spawn(command, args, { cwd: root, env, stdio });
  children.push(child);
  return child;
}
function stop() {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
process.once('SIGINT', () => { stop(); process.exit(0); });
process.once('SIGTERM', () => { stop(); process.exit(0); });
async function waitForEmulator() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const ready = await new Promise((done) => {
      const socket = createConnection({ host: '127.0.0.1', port: emulatorPort });
      socket.once('connect', () => { socket.destroy(); done(true); });
      socket.once('error', () => done(false));
    });
    if (ready) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Firestore Emulator did not become ready.');
}
async function portInUse(host, port) {
  return new Promise((done) => {
    const socket = createConnection({ host, port });
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('error', () => done(false));
  });
}

try {
  if (await portInUse('127.0.0.1', emulatorPort)) throw new Error(`Port ${emulatorPort} is already in use. Stop the other emulator first.`);
  if (await portInUse('127.0.0.1', port) || await portInUse('::1', port)) throw new Error(`Port ${port} is already in use. Stop the other preview first.`);
  const emulator = start('java', ['-jar', jar, '--host=127.0.0.1', `--port=${emulatorPort}`, `--project_id=${demoProject}`, '--database-edition=enterprise'], 'ignore');
  emulator.once('exit', (code) => { if (code !== 0) { stop(); process.exitCode = 1; } });
  await waitForEmulator();
  console.log(`Local speech lab: http://localhost:${port}/?speech-lab`);
  console.log('Firestore target: isolated demo emulator; two Nova-3 grants maximum for this run.');
  const server = start(vercel, ['dev', '--local', '--listen', `127.0.0.1:${port}`]);
  server.once('exit', (code) => { stop(); process.exitCode = code || 0; });
} catch (error) {
  stop();
  console.error(error instanceof Error ? error.message : 'Local trial startup failed.');
  process.exitCode = 1;
}
