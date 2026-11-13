# Year 7 Mock Interview Hub: private GitHub hand-off kit

This is a **documentation, QA and private-repository publication kit**, not an updated Angular app. The authoritative latest code remains on the owner's Mac under:

`/Users/sunmarke/Downloads/year-7-mock-interview-hub -final1`

Files:

- `CODEX_FINAL_QA_AND_PRIVATE_GITHUB.md` - single bounded instruction set to give Codex, including authorised private GitHub publication.
- `RELEASE_STATUS_2026-11-13.md` - evidence-based status and outstanding blockers.
- `UX_QA_MATRIX.md` - 20 test cases covering student, teacher, browser, voice, privacy and failures.
- `AI_ZERO_COST_QA.md` - how to test the full feedback UI with $0 and without changing the approved Haiku model.
- `SECURE_DEPLOYMENT_RUNBOOK.md` - future, non-authorised Vercel/OIDC work.
- `GITHUB_DELIVERY_EVIDENCE.md` - blank evidence form for Codex to populate only after successful remote publication.
- `../scripts/preflight.sh` - optional read-only local check for expected static audio, `.env.local` ignoring and tracked filenames. It does not publish anything.

## Use

1. Unzip this kit and copy the `docs/` markdown documents to the project's `docs/` folder, and optionally `scripts/preflight.sh` to the project's `scripts/` folder. Do not replace user code with anything from the ZIP.
2. Give Codex the entire `CODEX_FINAL_QA_AND_PRIVATE_GITHUB.md` file. Codex must inspect the actual Mac project, run checks, fix only confirmed scoped blockers, and document unverified tests honestly.
3. Publishing source to a **PRIVATE** GitHub repo is authorised after the secret/preflight gate. Vercel deployment, real student data, paid AI and live Firestore modifications are **not** authorised.
4. Read the returned GitHub URL, verified `PRIVATE` visibility, commit SHA and check counts; blank or guessed publication evidence is not acceptable.

## Limits of this kit

These documents were prepared from the user's screenshots, command outputs, uploaded code and Codex reports. We could not execute the current full macOS repository, Mac browsers, live Vercel functions or test iPad Safari. They are explicitly marked unverified in the status report.
