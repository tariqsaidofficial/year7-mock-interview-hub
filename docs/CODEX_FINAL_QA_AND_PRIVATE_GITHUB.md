# CODEX HAND-OFF: Final QA, evidence documentation and PRIVATE GitHub publication

You are operating on the owner's Mac, in the ACTUAL current local directory:

`/Users/sunmarke/Downloads/year-7-mock-interview-hub -final1`

## Authorisation and boundaries

The owner expressly requests completion of QA, documentation and a **private GitHub source-code publication**, but NOT a Vercel deployment. You may use the owner's local Git and GitHub CLI to create a PRIVATE repository and push after safety gates pass. If GitHub CLI needs interactive authentication, ask the owner to complete that login in Terminal. Never guess credentials. Do not assume files supplied to the chat match the present Mac workspace.

**Zero-spend policy: no credit purchase, no paid Haiku call, no other paid AI or cloud action.** Treat OpenRouter funded balance as zero even though its project key has a $5 cumulative TOTAL cap and current key usage $0.000. No automatic credit recharge. Do not invoke API evaluation with real pupil data. Preserve production model `anthropic/claude-haiku-5.5`, reasoning `medium`, and strict schema. No production model replacement or provider fallback. Mocked evaluation for QA is encouraged; optionally describe a future standalone `:free` API experiment, but do not make it a release dependency.

**Preserve the approved application:** Angular 21 SPA, Sunmarke blue/white restoration, original category cards, exact 10 questions, four domains, 10 static `q01.mp3`...`q10.mp3`, soft 08:00 clock, no automatic cutoff, MP3 replay, optional editable browser speech recognition, feedback animation, real evidence indicators, student copy, teacher password view. No Firebase Auth login; students are guests. No global UI redesign or major refactor.

**No other cloud mutations:** do not change deployed Firestore Security Rules, database edition, IAM policies, active run records, school settings or legacy `adminPin`. Do not create Vercel projects, link GitHub with Vercel, deploy previews/production, or modify live student records. No Firebase service-account private-key generation; organisation policy prohibits it. ADC works for authorised local read-only access; Vercel OIDC/Workload Identity Federation remains a later, separate approved task.

## A. Inspect the actual repository, do not rely on stale reports

1. Read `README.md`, `.env.example`, `.gitignore`, `package.json`, `angular.json`, `vercel.json`, `firebase.json`, `firestore.rules`, `server/firebase-admin.ts`, `server/session.ts`, `server/openrouter.ts`, `server/contract.ts`, `api/evaluate.ts`, `src/app/{app.ts,app.html,interview.service.ts,speech.service.ts,question-audio.service.ts,interview.models.ts}` and relevant tests. If files differ, record real paths.
2. Confirm `applicationDefault()` and explicit `FIREBASE_PROJECT_ID=gen-lang-client-0286975933` without JSON private-key dependencies. Named database ID must remain `ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2`.
3. Note only what is actually verified. Do not treat 17 frontend and 29 server PASS results from prior reports as proof of the CURRENT files unless rerun.
4. Verify exactly 10 nonempty MP3s exist, are included in the build and have unchanged hashes before/after the build. Decoding/being present is not proof of correct spoken wording.
5. Review the current system prompt and evaluation contract. Document its four labels, grounded strengths, no fabricated grades, off-topic handling and known limitations. Do not alter without demonstrated fault.

## B. Run local static and automated checks

Run with existing scripts:

- `npm ci` (if needed and safe in the current workspace)
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:server`
- `npm test -- --watch=false`
- `npm run test:server`
- `npm run build`
- `npm audit --omit=dev`

Record actual exit statuses and test counts in `docs/RELEASE_STATUS_2026-11-13.md`. If an emulator test needs special commands, run ONLY against a local emulator, never the live Firestore database. Do not claim a browser test based on a mocked Angular unit test.

## C. Targeted UX verification

Use `docs/UX_QA_MATRIX.md` from the release kit. Prioritise:

1. Opening the interview and 10 fixed questions, progress, navigation and preserved answers. The timer must count down 08:00 -> 00:00 and NOT auto-submit.
2. Check the student experience when `INTERVIEW_RUN_OPEN=false`. Latest inspected `app.ts` allowed the full 10-question interview before the backend would reject submission. Verify this in the actual current repo; if still true, add the smallest clear pre-start availability status or explanatory copy so the pupil does not discover an unavailable result only after 10 answers. Do not add student sign-in.
3. `Test microphone` currently checked `getUserMedia()` permission only in a supplied snapshot. Verify the CURRENT code. Do not claim a microphone-permission PASS validates transcription. Add a short, nonintrusive live transcription-readiness check only if clearly practical, otherwise label the limitation accurately.
4. Inspect `speech.service.ts` on the Mac: `en-GB`, `continuous`, `interimResults`, `onresult`, `isFinal`, cumulative final-text assembly, restarts, stop/abort and stale callbacks after Next/Back. The user observed homophone substitution with rapid natural British speech. Separate recognition accuracy limitations from transcript-merging errors. Preserve editing and no audio storage. No new heavy STT runtime library without a measured accuracy benefit.
5. Narration: Q1-Q10, replay, microphone not recording its own question MP3; no audio continues after moving. Do not infer word-for-word matches from file size or checksums. Real iPad Safari testing remains UNVERIFIED without an actual device.
6. Use browser/E2E request interception or locally validated fixtures to simulate ONLY feedback UI: happy path with 4 indicators, 0/1/2 supported strengths, blank/off-topic/partial, 429, 503, HTML 404, timeout, copy, refresh and local clear. **Mock feedback must be visibly test-only**; never show it as an authentic AI assessment.
7. Verify `/admin` view and accessibility in browser when possible. For a server-backed test with no paid AI or live writes, mock protected API responses or run an emulator. Server-side auth already has unit tests, but live Vercel auth/Firestore remains unverified.
8. Check desktop, 1180px tablet and 375px mobile for layout, keyboard controls, reduced motion, no horizontal scroll. Distinguish responsive simulation from physical iPad Safari.

Only fix confirmed, scoped bugs; document anything requiring an environment or owner approval as UNVERIFIED. Do not bury unresolved issues.

## D. Security and privacy preflight BEFORE creating GitHub repository

1. Confirm `.gitignore` excludes `.env*` except `.env.example`, `node_modules`, `/dist`, `.vercel`, ADC credential files, service-account JSON, session cookies, local outputs, student data/logs and generated captures with private information. Verify tracked/staged filenames and file contents, without printing secrets.
2. Use `scripts/preflight.sh` from the release kit. If possible run a local secret scanner such as gitleaks with redacted output, and manually inspect staged changes. Secret scanning is a best-effort gate, not a complete guarantee.
3. Do not commit the owner's `.env.local`, `~/.config/gcloud/application_default_credentials.json`, admin hash, `SESSION_PEPPER`, OpenRouter API key or real student records.
4. If you discover any secret or real pupil data in the staged tree, STOP. Remove it from stage and resolve BEFORE any push. If history exists and contains it, STOP for explicit remediation, don't push it.
5. Keep generated release docs in `docs/`, including `RELEASE_STATUS_2026-11-13.md`, `UX_QA_MATRIX.md`, `SECURE_DEPLOYMENT_RUNBOOK.md` and completed `GITHUB_DELIVERY_EVIDENCE.md`. Don't embed secret values in documentation.
6. Optional no-secret CI is welcome if it reliably works. Do not turn on any GitHub Actions that deploy, consume paid AI, or access live Firebase. If not viable, document that CI is not configured rather than assuming it ran.

## E. Publish source to GitHub PRIVATE (this part IS authorised)

Check `gh --version`, `gh auth status` and `git status` on the Mac. If `gh` is missing, install with the owner's ordinary package manager and complete interactive `gh auth login`. Do not ask the user to paste a token into chat.

The project was not previously a Git repository according to an earlier Codex report. If still true, initialise a Git repository on the current local source and use branch `main`. Avoid reinitialising or overwriting an existing repository. Stage only reviewed source, docs, tests, static question audio and safe public examples. Review `git diff --cached --name-only`, `git diff --cached --check`, staged sensitive filenames, and secret scanner results before creating the first commit.

Preferred GitHub target: `tariqsaidofficial/year7-mock-interview-hub`, PRIVATE. Confirm the authenticated GitHub owner before publication. If the name already exists, do not overwrite or force push: inspect the existing remote and safely reuse it ONLY if it is the correct repository; otherwise stop and report.

For a new empty remote, the documented CLI path is:

```
git init -b main                  # only if not already Git
 git add -A                      # only after verifying .gitignore
 git diff --cached --name-only
 git diff --cached --check
 git commit -m "Prepare Year 7 interview hub for private source review"
 gh repo create tariqsaidofficial/year7-mock-interview-hub --private --source=. --remote=origin --push
 gh repo view tariqsaidofficial/year7-mock-interview-hub --json visibility,url --jq '{visibility,url}'
 git rev-parse HEAD
```

Adapt commands safely to existing state; never force-push and never push to a public repo. Verify `visibility` returns `PRIVATE` AND the current commit is on the remote before declaring success.

GitHub is for source code backup and review, NOT classroom launch. Publishing a private source repo is allowed even while live Firebase/Vercel and AI E2E remain NO-GO, provided the README clearly labels the build as a development candidate and no secrets/pupil records are published.

## F. Final evidence report to owner

Provide, in Arabic where practical:

- Actual GitHub URL, owner, PRIVATE visibility, branch, HEAD commit SHA and pushed-file count.
- Exact successful checks with test counts, failures and unverified manual/device tests.
- Summary of current UX, including the unresolved speech-recognition word accuracy issue.
- Summary of local ADC, deployed deny-all rules as reported by owner, and unfinished Vercel OIDC WIF.
- OpenRouter $5 TOTAL limit but zero funded balance; number of actual paid API calls (must be 0).
- Confirmation Vercel was NOT linked/deployed, no live Firestore data changed.
- Remaining release blockers and explicit LOCAL SOURCE READY / CLASSROOM NO-GO decision.

**Do not finish by just saying 'Done'. Supply evidence.**
