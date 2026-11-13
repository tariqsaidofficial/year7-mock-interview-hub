# Year 7 feedback release review — 12 November 2026

## Decision

**Local release candidate; not approved for a Vercel classroom deployment yet.** The UI build and focused tests pass. The same-origin API has not been verified under Vercel routing with real Firebase configuration, and pupil-data handling and hosting-plan suitability require school approval. No deployment or cloud change was made.

## Scope and before/after

The restored Sunmarke white/blue/slate design, fixed ten questions, soft 08:00 countdown, manual finish, Lucide icons, static MP3 files, teacher dashboard and single OpenRouter model remain. The supplied patch passed `git apply --check` against the current files, but it was merged manually because its fixed `4 / 2 / 1` report and mandatory two-strength display could imply achievements without evidence, and its CSS budget increase was not justified.

Before: a static waiting card, four feedback cards, a hard-coded two-strength heading, a raw `response.json()` parse error on HTML responses, and loss of the result on refresh. After: a small CSS ring animation while evaluating, four topic chips, an Interview Snapshot with actual category indicators and returned strength count, an honest zero-strength state, a plain-language non-JSON error, and session-scoped result recovery until explicit clear.

## Data integrity and privacy

- Model output now allows zero to two strengths. The prompt asks for only directly supported strengths and none for blank or unrelated answers. Validation rejects more strengths than non-empty answers and rejects strengths when every category says `Not enough evidence`. Formatting, student cards and teacher view handle zero strengths without inventing praise.
- These checks do **not** prove semantic truth for arbitrary non-empty or off-topic answers. A synthetic live-model review of blank, sparse and irrelevant inputs remains required before pupils use it.
- The validated result is retained in `sessionStorage` in the same tab for up to 24 hours, paired with the existing local draft. Refresh restores the result and its Copy Feedback action. `Finish and clear this device` removes the draft and temporary result. If browser storage fails, the UI asks the student to copy before leaving.
- The model, credentials, Firestore rules, server-side teacher checks and existing ten MP3 assets were not replaced. No student data or secrets were used for this review.

## API and deployment checks

- The already-running `ng serve` preview returned `404 Not Found`, `Content-Type: text/html`, and `<!DOCTYPE html>` for `POST /api/evaluate`. This explains the observed JSON parse error: Angular's development server does not host the Vercel functions. The client now shows a clear error and preserves answers for retry. A Vercel-compatible local or preview test of `/api/config`, `/api/evaluate` and teacher routes is still **NOT RUN**.
- The Vercel function is configured for 60 seconds. Provider calls were previously allowed 38 seconds twice; they now share a 42-second provider deadline to leave time for Firestore finalisation. Actual hosted latency is **NOT VERIFIED**.
- Public Firebase identifiers are documented, but API/Admin/OpenRouter keys are absent locally and the project is not linked to Vercel. Firebase Anonymous/Google provider settings, authorised deployment domain, named Firestore database, teacher allowlist and live rules are **NOT VERIFIED**.
- Vercel Hobby eligibility and the current terms for processing school/pupil content must be resolved by the school before selecting that plan. School approval for Firebase, OpenRouter and browser speech processing is also outstanding.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run typecheck:server` | PASS |
| `npm test -- --watch=false` | PASS: 16 tests / 4 files |
| `npm run test:server` | PASS: 16 tests / 5 files |
| `npm run build` | PASS, no warnings; final measurements below |
| `npm audit --omit=dev` | PASS: 0 reported production vulnerabilities |
| Existing MP3 paths | VERIFIED: 10 in `public/`, 10 in build output; audio contents not reviewed |
| Real iPad Safari, live Firebase/OpenRouter, Vercel preview, classroom concurrency | NOT RUN |
| Browser screenshots at 375px/820px/desktop | NOT RUN: browser access host unavailable during this review |

The component tests cover waiting-state entry/exit, four category labels and indicators, no percentage/progress UI, a zero-strength result, copying and manual fallback. Service tests cover result recovery and clearing, HTML API response handling, timer continuity and audio state. Server tests cover blank, partial and irrelevant-answer contracts, authentication and idempotency. Reduced-motion CSS is present and statically inspected; its rendered behaviour still needs browser/device confirmation.

### Size and budget

| Measure | Before | After |
| --- | ---: | ---: |
| `src/app/app.css` | 14,413 B | 14,413 B |
| `src/styles.css` | 111 B | 4,550 B |
| Production CSS asset | 5.67 kB raw | 11.72 kB raw |
| Initial bundle | 409.38 kB raw / 92.25 kB transfer | 420.37 kB raw / 94.73 kB transfer |
| Component CSS budget warning/error | 15/16 kB | 15/16 kB |

No animation dependency or Angular budget increase was added. The loading motion uses transform/opacity and stops under `prefers-reduced-motion: reduce`.

## Files changed

- `src/app/app.html` — waiting animation, snapshot, evidence and honest strengths, storage warnings.
- `src/styles.css` — compact feedback-only visual rules and reduced-motion override.
- `src/app/app.spec.ts` — waiting, category indicator and zero-strength rendering checks.
- `src/app/interview.models.ts` — zero-to-two-strength evaluation type.
- `src/app/interview.service.ts` — session result recovery, JSON error handling and storage status.
- `src/app/interview.service.spec.ts` — result, copy, expiry and non-JSON tests.
- `src/app/result-store.ts` — bounded same-tab result storage and explicit removal.
- `server/contract.ts` — honest strength cardinality and formatting checks.
- `server/openrouter.ts` — evidence instructions and bounded provider time.
- `api/evaluate.ts` — removes an unconditional claim that local saving succeeded.
- `qa/contract.test.ts` — blank, partial and off-topic contract cases.
- `README.md` — result recovery and smoke-test guidance.
- `docs/feedback-release-review.md` — this report.
- `.impeccable/config.json` — narrow `overused-font` exception for the existing Plus Jakarta Sans brand typeface.

## Design-hook triage

- **Fixed:** Removed the 3px coloured top border from the rounded detailed-feedback cards. Their existing category icons and evidence labels continue to distinguish the topics without the clashing accent.
- **Suppressed narrowly:** The `overused-font` warning for `Plus Jakarta Sans` only. The font was already loaded by `src/index.html` before this feedback task, and the brief requires retaining the restored Sunmarke visual identity. The exception is recorded with that reason in `.impeccable/config.json`.
- **Left standing:** None of the two reported findings.

## Remaining release gates

1. Configure owner-entered credentials and Firebase settings in the intended Vercel environment; verify auth providers, authorised domain, named database and deny-all client rules without exposing keys.
2. Run the actual Vercel functions and student/teacher journeys with synthetic identities; verify JSON responses, result recovery, retries, Firestore record permissions and timeouts. A live model request requires separate approval and may spend credits.
3. Review real model outputs for blank, sparse and irrelevant answers. Fix any unsupported claims before classroom use.
4. Confirm the ten audio clips match the exact approved questions and test microphone, audio and responsive UI on real iPad Safari, plus desktop and 375px/820px browser views.
5. Confirm the school's privacy approval and a Vercel plan suitable for this school activity. Then obtain visual approval before publishing.
