# npm installation maintenance — 22 November 2026

Base: afadf114f877131655a0e6ef41588e486c77f4e3. Maintenance branch: chore/npm-install-policy-2026-11-22. Production alias was independently READY at dpl_CnA4DkMFV57ez6PH3noNFJwxQndi before changes. No Production promotion, credential, Firebase, classroom gate or application-code changes are authorised here.

## Cache warning

Observed build warning: `npm warn Unknown env config "cache-dir". This will stop working in the next major version of npm. See npm help npmrc for supported config options.` No repository .npmrc/cache-dir setting or project-level npm/cache environment variable name existed. Thus the observed input is build-environment-injected, rather than application configuration. The exact injected spelling is printed by the compatibility wrapper in Preview logs (never its value).

Vercel install/build commands now start a plain Node wrapper before npm initialises. It maps only legacy npm_config_cache_dir / case or hyphen equivalents into supported npm_config_cache, preserves an already-supported setting, deletes the obsolete aliases from the child environment and leaves other variables untouched. Cache path is preserved, not hard-coded. No warning suppression/loglevel changes. Regressions test mapping, precedence and unchanged input/environment.

## Reviewed install-time code

Registry tarball versions and SHA-512 integrity remain unchanged in the existing lockfile. Initial installation used --ignore-scripts for inspection. Then npm install-scripts ls was run with the official npm 12.2.3 CLI (older locally installed npm lacked this command). Node 24.18.0 was used for final checks. Tooling is documented/pinned as npm@12.2.3; engines require policy-capable npm 12.2.3–12.x. .npmrc enables strict-allow-scripts and engine-strict so unknown future script approvals fail closed.

| Package | Reviewed lifecycle behavior | Decision |
|---|---|---|
| esbuild 0.28.1 | install.js chooses platform binary, optimises executable and verifies exact version; can spawn npm/download exact-version fallback from npm registry if optional binary missing | Only approval: esbuild@0.28.1=true |
| @firebase/util 1.15.3 | postinstall reads FIREBASE_WEBAPP_CONFIG, may fetch Google webConfig, writes generated defaults | Deny; server Admin SDK does not need client config injection |
| @parcel/watcher 2.6.0 | scripts/build-from-source.js spawns node-gyp only for explicit source-build request | Deny; supported prebuilt optional packages used |
| lmdb 3.5.1 | node-gyp-build-optional-packages tests native binding, can invoke source compiler | Deny; prebuilt binding verified locally; Linux build checked in Preview |
| msgpackr-extract 3.0.7 | same native optional-build helper | Deny; prebuilt/fallback path remains available |
| protobufjs 7.6.6 | scripts/postinstall checks parent dependency version scheme and emits compatibility notice | Deny; no runtime generation needed |
| fsevents 2.3.3 | extra macOS-only package flagged by npm policy; published native binary, no runtime install required | Deny; not present on Vercel Linux |

Explicit false entries are name-wide denials, intentionally carrying no future permission. True approvals are exact-version-only. Native node-gyp display in npm ls can be synthetic; actual installed package.json scripts and invoked helper sources were inspected. No broad approval/bypass flags were used.

Reviewed script SHA-256:

- esbuild/install.js: 612294e278914443bdcf81cb17f54afec34dbdd2ebd999a6ee187912320cc315
- @firebase/util/postinstall.js: 9fe08f52b78bfd19d2a8255b3e72491929dd8b5502f800ff431b30204ca76f72
- @parcel/watcher/scripts/build-from-source.js: e97ada845f9423f9d1a02284bef36ff1e8f648141897c94d7b10edeb38f96b47
- node-gyp-build-optional-packages/bin.js: b6c3ee58c7199854c80d2a6a7a67292ec6c9be9b6de2125c8f8370afc3c6bff4
- protobufjs/scripts/postinstall.js: 5af8463b97ee8e309b4a2111f9479bacdf0c180de0ca0155527679b1fc6d9e6c

## Local results

npm ci PASS (890 installed, no unreviewed-script warning); npm install-scripts ls: no unreviewed packages. Lint, client/server typechecks, 89 client tests, 57 server/API tests, production build PASS. Three new Node install-policy tests PASS. Temporary synthetic native-dependency smoke (lmdb write/read, msgpackr roundtrip, watcher/fsevents APIs) PASS. Production dependency audit: 0 vulnerabilities.

Remaining warnings: node-domexception 1.0.0, eslint 9.39.5, OpenTelemetry sdk-trace-base/web 2.9.0/2.10.0 deprecations. Full install audit reports 25 moderate vulnerabilities in the development-inclusive tree; production-only audit is zero. No dependency upgrades or audit fix --force attempted. Build initial bundle 500.45 kB exceeds warning budget by 455 bytes; build succeeds. Existing jsdom canvas warnings do not fail tests. Unsupported platforms without prebuilt native binaries may require a separately reviewed source-build approval; no wildcard permissions added.

## Preview gate

Push only this maintenance branch; verify READY, matching SHA and actual install/build logs before recommending any Production update. Preview remains protected and closed to live classroom operations; it does not inherit the branch-specific synthetic flag from the prior feature branch. Production continues serving its existing deployment. Final deployment ID, warning comparison and live availability recheck are in the completion report.

References: https://docs.npmjs.com/cli/commands/npm-install-scripts/ and https://docs.npmjs.com/using-npm/config/ . Integrity/approval controls limit exposure; they are not a guarantee that an approved upstream package can never be compromised.
