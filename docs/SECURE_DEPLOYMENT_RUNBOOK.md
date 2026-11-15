# Private GitHub -> Vercel release runbook

This document plans future deployment; it is not authority to deploy to Vercel or alter cloud resources.

## Target architecture

- Angular 21 SPA with 10 static MP3 question recordings.
- No Firebase browser SDK login; pupils are guests.
- Vercel server functions hold guest/admin sessions and evaluate transcript text only.
- Firebase Admin SDK accesses existing named Firestore database via ADC locally and approved Vercel OIDC -> GCP Workload Identity Federation (WIF) in production.
- Deployed Firestore Security Rules deny browser read/write. Firestore Admin access is controlled by IAM, not the rules.
- No service account private key or Google ADC file stored in GitHub/Vercel.
- OpenRouter production model stays `anthropic/claude-haiku-5.5`; key has $5 cumulative cap but no funded balance as of 2026-11-13.

## Server-only environment variable register

| Key | Source | Mandatory for running with the real backend | GitHub commit? |
| --- | --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Existing GCP project | yes | value may appear in `.env.example`, not secret |
| `FIRESTORE_DATABASE_ID` | Existing named Enterprise Native DB | yes | value may appear in `.env.example` |
| `INTERVIEW_RUN_ID` | Unique synthetic run ID for tests | yes | actual run configuration should be environment-specific |
| `INTERVIEW_RUN_OPEN` | Keep `false` until approved | yes | no runtime secret |
| `PAID_OPERATIONS_ENABLED` | `true` only while provider spend is authorised; `false` pauses new paid work | yes | no runtime secret |
| `APP_ORIGIN` | Exact deployed HTTPS domain, localhost in local test | yes | no runtime secret |
| `SESSION_PEPPER` | Random >=32 characters, private, stable during a run | yes | NEVER |
| `ADMIN_PASSWORD_HASH` | generated with `scripts/hash-admin-password.mjs` locally | yes | NEVER |
| `OPENROUTER_API_KEY` | Owner-controlled project key | real AI only | NEVER |
| `OPENROUTER_MODEL` | `anthropic/claude-haiku-5.5` | real AI only | example value okay |
| `DEEPGRAM_API_KEY` | Owner's Member-level project key | Nova-3 token grants | NEVER |
| `DEEPGRAM_LIVE_TRIAL` | Local Speech Lab launcher only | never in production | do not configure |
| WIF/OIDC config | Owner + GCP IAM/Vercel documented setup | hosted backend | avoid treating generated short-lived tokens as project files |

## GitHub publication

1. Confirm complete and current local project, run all package checks and manual UX test matrix.
2. Ensure `.gitignore` excludes `.env*` except `.env.example`, `node_modules`, build output, logs, service-account files and local credentials.
3. Use the provided `scripts/preflight.sh` from the project root. It is non-destructive and prints only potentially unsafe file names.
4. Initialise Git if absent, stage, inspect staged file names and diff, commit. Never stage `.env.local` or Google ADC files.
5. Run `gh auth login` if necessary, then `gh repo create Year7-Mock-Interview-Hub --private --source=. --remote=origin --push`.
6. Confirm GitHub repository visibility is PRIVATE and the expected files exist remotely. Keep Vercel unlinked.
7. Configure GitHub CI to run lint, typecheck, unit/server tests, build with NO cloud secrets and NO deployment action.

## Vercel AFTER approval

1. Resolve whether school's usage of Vercel Hobby complies with Vercel's personal/non-commercial restrictions. A private GitHub repository does not resolve hosting-plan requirements.
2. Configure Vercel project from the approved GitHub repository only after a deliberate deployment decision.
3. Configure GCP Workload Identity Federation restricted to the expected Vercel team/project/environment, and grant only necessary Firestore IAM. Do not broaden trust to other Vercel projects or unreviewed previews.
4. Obtain cloud approval for storing school pupil data in `asia-southeast1` and processing text via the model provider.
5. Configure server-only environment variables; set `INTERVIEW_RUN_OPEN=false` initially.
6. Validate actual `vercel dev`/preview API routes, origin/cookie behaviour, Firebase admin reads/writes using synthetic records, admin flows and cleanup.
7. Run one classroom dress rehearsal with mock AI only. Do not pretend the mock is a real evaluation.
8. Only after consent, funding and explicit owner approval test a single real Haiku evaluation with synthetic answers.

## Retention caveat

- 'Finish and clear this device' clears the browser's temporary data; it does NOT delete central records.
- 'Clear this session's records' removes central completed records for the run but does NOT automatically remove session and counter documents.
- Define school-approved retention and deletion workflow before collecting real pupils' answers.
