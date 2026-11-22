import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { npmEnvironment } from '../scripts/vercel-npm.mjs';

test('maps only legacy npm cache names without changing unrelated environment or input', () => {
  for (const key of ['npm_config_cache_dir','NPM_CONFIG_CACHE_DIR','npm_config_cache-dir']) {
    const input = { [key]: '/tmp/example-cache', INTERVIEW_RUN_OPEN: 'false', OTHER: 'untouched' };
    const {env}=npmEnvironment(input);
    assert.equal(env.npm_config_cache,'/tmp/example-cache'); assert.equal(env[key],undefined);
    assert.equal(env.INTERVIEW_RUN_OPEN,'false'); assert.equal(env.OTHER,'untouched'); assert.equal(input[key],'/tmp/example-cache');
  }
});
test('preserves an explicitly supported cache setting and strips obsolete aliases',()=>{
  const {env}=npmEnvironment({npm_config_cache_dir:'/old',NPM_CONFIG_CACHE:'/chosen'});
  assert.equal(env.NPM_CONFIG_CACHE,'/chosen'); assert.equal(env.npm_config_cache,undefined);
  assert.equal(env.npm_config_cache_dir,undefined);
});
test('every approval matches an exact registry version in the committed lockfile',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
  for(const [identity,allowed] of Object.entries(pkg.allowScripts)) {
    if(!allowed)continue;
    assert.match(identity,/@\d+\.\d+\.\d+$/);
    const split=identity.lastIndexOf('@');const name=identity.slice(0,split),version=identity.slice(split+1);
    const installed=lock.packages['node_modules/'+name];assert.equal(installed.version,version);
    assert.match(installed.resolved,/^https:\/\/registry\.npmjs\.org\//);assert.match(installed.integrity,/^sha512-/);
  }
  assert.equal(pkg.allowScripts['esbuild@0.28.1'],true);
  for(const name of ['@firebase/util','@parcel/watcher','lmdb','msgpackr-extract','protobufjs','fsevents'])assert.equal(pkg.allowScripts[name],false);
});
