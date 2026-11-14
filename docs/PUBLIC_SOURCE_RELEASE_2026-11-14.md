# Public source release — 14 November 2026

The owner authorised making the existing `tariqsaidofficial/year7-mock-interview-hub` repository public after a full exposure audit. This publishes source and documentation, **not** a classroom application.

## Exposure audit

- Reviewed the current `main` branch, the `experiment/nova3-speech` branch, all reachable revisions and deleted paths. No tags exist.
- Gitleaks scanned the complete reachable Git history with `--all --full-history`; a separate pattern scan covered every unique text blob. Neither found an identified credential, private key, token, non-example email address or pupil record.
- `.env.local`, credentials, logs and generated output are ignored and absent from Git history. The tracked `.env.example` has blank secret fields in every revision. Public Firebase project/database identifiers are configuration identifiers, not credentials.
- Three tracked Speech Lab screenshots were visually reviewed; they show an empty adult test form and have no embedded text or EXIF chunks. Ten question MP3 files contain only an encoder metadata tag.
- GitHub has no Actions runs, build artifacts or releases for this repository at the time of review. Tests use explicitly synthetic identities and example addresses.

## Local quality gates

| Gate | Result |
| --- | --- |
| Lint and client/server typechecks | PASS |
| Angular tests | PASS: 27 |
| Server tests | PASS: 34 |
| Local Firestore rules and synthetic concurrency tests | PASS: 8 |
| Production build | PASS: 366.98 kB raw initial bundle |
| Production dependency audit | PASS: 0 reported vulnerabilities |
| Source preflight and MP3 presence | PASS: all ten question files present |

## Deployment gate

**NO-GO for Vercel classroom activation.** The connected Vercel account and DXBMARK team have no Year 7 project. Hosted Firebase Admin Workload Identity Federation, named-database IAM, deployed deny-all client rules and hosted API journeys remain unverified. OpenRouter has no funded evaluation path under this task's stated conditions. School hosting eligibility must be established before any staging or production deployment. Keep the classroom run closed; do not substitute mock feedback for the approved Haiku evaluator.

The earlier private-release documents remain in this repository as dated historical evidence. Their prior PRIVATE visibility statements do not describe the current public-source decision.
