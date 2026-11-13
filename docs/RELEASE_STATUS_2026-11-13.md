# Year 7 Mock Interview Hub: local QA and release status

Date: 13 November 2026, Asia/Dubai. Current source: `/Users/sunmarke/Downloads/year-7-mock-interview-hub -final1`.

**Decision: LOCAL SOURCE READY FOR PRIVATE GITHUB REVIEW; CLASSROOM NO-GO.** This repository is a source backup/review candidate. It is not a deployed or fully exercised classroom service.

## Checks rerun on the current source

| Check | Observed result |
| --- | --- |
| Runtime used | Node 24.22.3 in a temporary local installation; project files and lockfile were not changed for it. |
| Lint | PASS, exit 0. |
| Angular client typecheck | PASS, exit 0. |
| Server typecheck | PASS, exit 0. |
| Angular tests | PASS, 18 tests in 4 files. |
| Server tests | PASS, 30 tests in 7 files. |
| Firestore rules test | PASS, 1 test against local Firestore Enterprise Native emulator at 127.0.0.1:8085; no live database connection. |
| Production build | PASS, initial 323.87 kB raw / 69.60 kB estimated transfer. |
| Production dependency audit | PASS, `npm audit --omit=dev`: 0 reported vulnerabilities. |
| Question audio | PASS for 10 nonempty source files, 10 build files, 10 matching SHA-256 pairs, 10 clean ffmpeg decodes; headless Chrome requested all ten with successful HTTP responses. Spoken wording was not checked by a human. |
| Secret preflight before Git | Release-kit `scripts/preflight.sh` PASS; Gitleaks 8.30.1 directory scan found no leaks. Staged-file scan is a separate gate before publication. |

`npm ci` was not needed because dependencies were already installed; all package scripts above ran against the existing lockfile. The current directory had no Git repository before this release task.

## Browser and user journey evidence

Chrome 157.0.8103.51 headless on macOS 26.6.2, local Angular UI at `127.0.0.1:3000`, synthetic identity and answers, all `/api/*` calls intercepted with test responses. The tested UI is **not** proof that Vercel functions or Firestore work. No model or Firebase live request was made. Desktop 1440px, simulated tablet 1180px and mobile 375px had no horizontal overflow. Visually reviewed screenshots showed the approved Sunmarke layout, question view and four-card feedback view; screenshots stayed in a temporary QA directory and were not staged.

PASS: closed-run warning before setup; open-run setup; Q1-Q10 navigation, Back and retained answer; countdown 08:00 → 07:59 → 00:00 with no forced submit; manual finish; ten MP3 HTTP requests; mock feedback visibly marked `SIMULATED / NOT REAL AI`; four indicators; copy; refresh restore; local clear; 429, 503 and HTML 404 preserve answer copy and permit retry; a hanging request exits loading after the client deadline; reduced-motion animation is disabled; mock administrator sign-in, record details/filter and confirmed deletion of one synthetic record. The browser scripts were temporary and the mock did not call the production model.

UNVERIFIED: real Chrome speech transcription accuracy, homophone recognition, exact spoken MP3 wording, real Safari/physical iPad, keyboard/screen-reader walkthrough, 30-device shared-network load, live Vercel API/session cookies, live Firebase Admin writes and cleanup, and actual Haiku feedback quality. The microphone test only checks media permission; it now says so clearly. No browser test used real pupils.

## Confirmed scoped fixes in this task

- Added pre-start `/api/guest/availability` and a fail-closed status message on the welcome screen. The prior UI allowed a closed run to reach all ten questions before the submission was refused.
- Fixed administrator form submission: the previous `ngSubmit` binding did not trigger a POST in the rendered form; a local Chrome test reproduced this and confirmed the fix.
- Joined separate final speech-recognition segments with spaces and expanded the unit case. This fixes a transcript-assembly defect; it does not claim to improve the browser engine's homophone accuracy.
- Reworded microphone readiness to distinguish permission from transcription quality.
- Expanded `.gitignore` for local credentials, logs, generated captures, caches and unrelated working artifacts. The existing session/auth, Firebase database, model, questions, MP3s and design were preserved.

## Services and publication gates

The code uses Firebase Admin ADC with explicit project `gen-lang-client-0286975933` and named database `ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2`. The owner reports a successful read-only ADC connectivity test and published deny-all Firestore client rules; this task independently tested only the local rules in an emulator. Vercel OIDC → Google Workload Identity Federation and least-privilege hosted IAM remain unconfigured. No live Firestore record was read, written or deleted in this task.

The production model remains `anthropic/claude-haiku-5.5` with medium reasoning, strict JSON schema, four ordered evidence indicators, zero-to-two grounded strengths, a realistic next step and no percentages/grades. Tests cover blank, partial and unrelated answers, but semantic accuracy of a live model response remains unverified. The owner reports a USD 5 total key cap and zero funded OpenRouter credits. **Actual paid AI calls in this task: 0.** No free-model fallback was installed.

Private GitHub publication is authorised only after staged names/content and secret checks pass. Vercel remains unlinked and undeployed. School data-region/retention approval, hosted WIF/IAM, real browser/device QA and an explicitly approved funded Haiku test remain classroom blockers.
