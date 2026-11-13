# Year 7 Mock Interview Hub — local restoration report

## Before and after

The original AI Studio reference used a blue/slate/white school header, four illustrated category cards, separate student and audio-readiness sections, a question context banner, segmented progress, a prominent microphone area and grouped feedback cards. The recent secure refactor kept the application contracts but flattened much of that presentation. The restored Angular screens now bring back those structures and category colours while retaining the ten-question model, protected APIs and Firestore access rules. The former hard eight-minute deadline is now a visible suggested countdown from 08:00 to 00:00; at zero it stops, shows calm guidance, and leaves answers and navigation available until the student chooses Finish Interview. No overtime count is displayed.

All decorative icons are now rendered from the official `@lucide/angular` package, with only the icons used by this application imported. The header, interview context, progress, hint, Replay control, microphone status and results cards were inspected in Safari desktop and Safari Responsive Design Mode at 1180px and 375px. This is a viewport check, not a test on a physical iPad.

## Verification

- `npm run lint` — passed.
- `npm run typecheck` and `npm run typecheck:server` — passed.
- `npm test -- --watch=false` — 4 files, 10 tests passed, including countdown, draft resume, manual completion, audio states and feedback-card rendering.
- `npm run test:server` — 5 files, 15 tests passed, including authentication and evaluation idempotency contracts.
- `npm run build` — passed without warnings after the countdown correction; initial bundle 409.38 kB raw / 92.25 kB estimated transfer. The final `dist/app/browser` contains all ten existing MP3 files.
- `npm audit --omit=dev` — 0 production vulnerabilities after pinning `@grpc/grpc-js` 1.14.7; full development dependency audit still reports 28 moderate findings.
- `npm ls` — Firebase 13.3.0, Firebase Admin 14.5.1, Lucide Angular 1.72.0 installed.
- Browser preview — earlier Safari desktop and responsive viewport inspection covered the restored layout. This correction verified the exact countdown sequence 08:00 → 07:59 → 00:30 → 00:00, continued editing after zero, and preserved draft start time in automated tests. A fresh browser screenshot of this correction has not been exported.

## Firebase and audio readiness

`.env.example` contains the supplied public Firebase project identifiers. `FIREBASE_PUBLIC_API_KEY`, `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` and `OPENROUTER_API_KEY` are intentionally blank. The teacher allowlist and run ID are placeholders. `/api/config` fails closed until required public values are supplied; no real credential was committed, deployed or sent to a service. The client retries a failed configuration request.

The ten static audio paths are documented in `docs/audio-manifest.md`. Ten existing MP3 files were found under `public/audio/questions/` despite the earlier claim that none existed. They remain in place and are included in the local build. Their spoken wording, voice and approval status were not verified in this review. No new MP3 file or ElevenLabs key was added during this correction. If audio is unavailable, the question text remains readable. `docs/question-review.md` has the exact original master question texts and current hints for teacher review. Verify each recording against approved wording before publication.

## Files changed in this local work

- `.env.example`
- `README.md`
- `angular.json`
- `package.json`
- `package-lock.json`
- `api/config.ts`
- `src/app/app.css`
- `src/app/app.html`
- `src/app/app.spec.ts`
- `src/app/app.ts`
- `src/app/draft.ts`
- `src/app/firebase.ts`
- `src/app/interview.models.ts`
- `src/app/interview.service.ts`
- `src/app/interview.service.spec.ts`
- `src/app/question-audio.service.ts` (new)
- `src/app/question-audio.service.spec.ts` (new)
- `src/app/speech.service.ts`
- `src/app/ui-icon.component.ts` (new)
- `qa/draft.test.ts`
- `docs/audio-manifest.md` (new)
- `docs/question-review.md` (new)
- `docs/restoration-report.md` (new)
- `qa/contract.test.ts` (exact ten-question wording contract)

## Remaining limits

The computer-use screenshot utility timed out in the earlier visual review, and the Chrome browser access host was unavailable during this correction, so no PNG screenshot files could be exported. The feedback screen was checked with a synthetic unit fixture but not captured in a browser because no live evaluation key was supplied. No physical iPad, live Firebase sign-in, real provider request, audio asset playback or classroom concurrency test was performed. No repository, commit, deployment, live Firebase change or paid API use occurred.
