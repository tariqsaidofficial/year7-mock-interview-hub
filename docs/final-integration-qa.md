# Year 7 Mock Interview Hub — final integration QA gate

Date: 12 November 2026. Scope: current local Angular workspace only. No production deployment, live data change, paid AI request, or real pupil data was used.

## Decision

**NO-GO for Vercel classroom release.** The local build and focused synthetic tests pass, but Vercel-compatible routes, Firebase deployment/security state, OpenRouter billing controls and the real student/teacher journeys remain unverified because this workspace has no Vercel link, CLI credentials or runtime secrets.

## Confirmed checks

| Check | Result |
| --- | --- |
| Lint | PASS after correcting a test-only empty callback. |
| Client and server typechecks | PASS / PASS. |
| Angular tests | PASS: 17 tests in 4 files. |
| Server tests | PASS: 20 tests in 5 files. |
| Production build | PASS outside sandbox, no warnings; 420.97 kB raw / 94.83 kB estimated transfer. Sandbox attempt exited 134 while esbuild started. |
| `npm audit --omit=dev` | PASS: 0 reported vulnerabilities after running with network access. Sandbox attempt failed with `getaddrinfo ENOTFOUND registry.npmjs.org`. |
| MP3 files | PASS: 10 source files, 10 build files, all 10 SHA-256 pairs identical; all 10 decode without ffmpeg errors. Spoken wording and browser playback were not verified. |
| Secret-pattern scan | No private-key blocks, OpenRouter key shapes or full Firebase API-key shapes found in reviewed source, build output or local debug log. This pattern scan cannot prove the absence of every sensitive datum. |

The workspace is not a Git repository (`fatal: not a git repository`), so no branch/commit comparison was available. No `.env` file or `.vercel` link exists here. Relevant runtime variables are unset in this shell. `.env.example` and `.firebaserc` point to Firebase project `gen-lang-client-0286975933`; `firebase.json` references the named database `ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2`. These are local configuration values, not confirmation of deployed state.

## API, Firebase and AI status

- **Local handler tests — PASS:** `/api/config` returns public configuration when supplied with synthetic values; `/api/evaluate` rejects missing or invalid student requests; teacher record access rejects an unallowlisted user; `/api/admin/clear` rejects missing/unauthorised users and a mismatched run confirmation. Idempotency tests show one synthetic completed result for repeated identical requests. A hanging mocked evaluation request now exits the loading state after 70 seconds with answers retained.
- **Vercel routing — NOT RUN:** Vercel CLI 65.15.0 was fetched into a temporary cache. `vercel dev` stopped at the login prompt; it did not launch or link a project. The previously observed `ng serve` route returned `404`, `Content-Type: text/html` and `<!DOCTYPE html>` for `POST /api/evaluate`, which does not test serverless functions. No hosted route latency was measured.
- **Firebase live — NOT VERIFIED:** Anonymous/Google provider configuration, authorised domain, deployed Security Rules, direct client denial, legacy collections and Admin SDK read/write access cannot be inspected from this workspace. The local `firestore.rules` is deny-all, but it is not proof of the deployed rules.
- **OpenRouter live — NOT VERIFIED:** Source fixes model ID to `anthropic/claude-haiku-5.5`, uses medium reasoning and reads the key server-side. The key is unset here; the USD 5 cap and disabled automatic recharge could not be inspected. No paid request was made, so model latency or semantic accuracy was not measured.
- **Browser journeys — NOT RUN:** The browser access host was unavailable. Angular tests cover core rendering, timer, recovery, feedback and audio states; they are not Chrome/Safari or physical iPad proof. No synthetic teacher record was created or deleted in live Firestore.

## Confirmed blockers fixed locally

1. `src/app/interview.service.ts`: a request or token acquisition that never settles previously left `evaluating` indefinitely. A 70-second client deadline now aborts the request, shows a retry message and retains the draft. `src/app/interview.service.spec.ts` verifies this with a hanging synthetic request.
2. `api/admin/clear.ts`: missing `INTERVIEW_RUN_ID` could throw outside the handler's guarded path for an authorised teacher. It now returns the existing safe 503 JSON error. `qa/api-auth.test.ts` verifies this plus synthetic config, invalid-body, authorisation and confirmation gates.

No UI redesign, question, MP3, provider, Firebase rule or cloud setting changed. The only source changes in this gate are the four files above and this report.

## Release blockers remaining

1. **Critical:** Owner must provide a linked Vercel development/preview environment and configure the required variables privately. Then test actual same-origin JSON routes and latency; do not use `ng serve` as API proof.
2. **Critical:** Inspect deployed Firebase rules and auth settings and verify direct client denial plus server-side access using synthetic identities. Audit legacy collections without modifying or deleting them automatically.
3. **Critical:** Owner must confirm the OpenRouter USD 5 key cap and disabled automatic recharge before explicitly approving one paid synthetic evaluation. Blank/partial/off-topic model outputs still need review for unsupported claims.
4. **High:** Complete Chrome/Safari student and teacher journeys, responsive/iPad checks, MP3-to-question listening review and explicit clear/refresh tests against a Vercel-compatible app.

Stop at this gate. Do not push, deploy, change live rules or process real student data.
