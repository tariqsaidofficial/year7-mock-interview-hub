# Private GitHub delivery evidence

Publication verified on 13 November 2026 at 08:18 +04 (Asia/Dubai). This records the source publication commit. The follow-up documentation commit containing this evidence is visible as the current `main` HEAD; a file cannot embed its own commit SHA without changing that SHA.

| Item | Observed result |
| --- | --- |
| Authenticated GitHub account and owner | `tariqsaidofficial` (`gh api user --jq .login`). |
| Repository | `https://github.com/tariqsaidofficial/year7-mock-interview-hub`. |
| Visibility | `PRIVATE`, verified with `gh repo view ... --json visibility,url,defaultBranchRef` both before and after the first push. |
| Branch | `main`; tracking `origin/main`. |
| Source publication commit | `9f9e67e193f1c152d3553f989b586240510bd962`. Local HEAD and `git ls-remote origin refs/heads/main` matched after the first push. |
| Files published | 82 tracked files, including README, release docs, tests, source and all ten q01–q10 MP3 files. The documentation follow-up changes existing files only. |
| Source/build MP3s | 10/10 present, nonempty, SHA-256 matching; 10/10 clean ffmpeg decodes; Chrome requested all ten with successful HTTP responses. Human word-for-word listening remains unverified. |
| `.env.local` staged/tracked | NO; `git check-ignore` and release-kit preflight confirmed exclusion. |
| ADC/private-key/service-account JSON staged | NO; staged filename and content pattern checks found none. |
| Admin hash, session pepper, OpenRouter key staged | NO; staged pattern scan found none. The public `.env.example` has blank placeholders. |
| Staged whitespace | PASS after removing a trailing blank line from `docs/question-review.md`. |
| Secret scanner | Gitleaks 8.30.1 scanned an export of all 82 staged files (1.45 MB), no leaks. Its `git` mode saw 0 commits before the first commit, so the staged export is the meaningful result. Manual pattern scan also found 0 matches; neither proves absence of every possible secret or pupil datum. |
| Local checks | Node 24.22.3: lint, client/server typechecks, 18 Angular tests, 30 server tests, one Firestore emulator rules test, production build (323.87 kB initial raw), `npm audit --omit=dev` with 0 reported vulnerabilities. |
| Browser QA | Chrome 157 headless on macOS 26.6.2, desktop/1180px/375px simulated widths, mock API only. Student, error, feedback and teacher journeys passed as detailed in `RELEASE_STATUS_2026-11-13.md`; real Safari/iPad and speech accuracy remain unverified. |
| GitHub CI | Not configured or run. |
| Paid AI calls in task | 0. |
| Live Firestore mutations in task | 0. |
| Vercel linked/deployed | NO. |

**Release decision:** private source publication complete; classroom production remains **NO-GO**. Hosted Vercel OIDC → GCP Workload Identity Federation, real API/session/Firestore QA, physical Safari/iPad audio and speech checks, retention approval and an explicitly funded/approved Haiku test remain outside this publication task.
