import { spawnSync } from 'node:child_process';

/** Normalise Vercel's legacy injected cache key before npm parses its environment. */
export function npmEnvironment(source) {
  const env = { ...source };
  const legacy = Object.keys(env).filter(key => key.toLowerCase().replaceAll('-', '_') === 'npm_config_cache_dir');
  const supported = Object.keys(env).some(key => key.toLowerCase() === 'npm_config_cache');
  if (!supported && legacy.length) env.npm_config_cache = env[legacy[0]];
  for (const key of legacy) delete env[key];
  return { env, legacy };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const { env, legacy } = npmEnvironment(process.env);
  if (legacy.length) console.log(`npm cache compatibility: ${legacy.join(', ')} replaced by supported npm_config_cache (value not logged).`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', process.argv.slice(2), { env, stdio: 'inherit' });
  if (result.error) { console.error('Unable to launch npm.'); process.exit(1); }
  process.exit(result.status ?? 1);
}
