# Year 7 classroom capacity change — 15 November 2026

## Scope and controls

This change removes the fixed 40 guest slots, shared-IP guest quota and cumulative Nova-3 grant ceiling. It preserves the existing classroom run gate, secure guest cookies, IP-bound session validation, same-origin/CSRF checks, teacher authentication, one assessment record per guest per run and evaluation Request ID idempotency. The approved V5 screens, ten questions, ten MP3 files, eight-minute soft timer, Nova-3 and Claude Haiku model are unchanged.

Normal Nova-3 requests allow 20 grants per guest per minute, with no lifetime quota. The two-grant global counter exists **only** for the isolated emulator-backed adult Speech Lab trial. `PAID_OPERATIONS_ENABLED=false` pauses newly initiated token grants and AI evaluations. An identical completed evaluation remains retrievable while paused. The run can stay open for drafts and existing feedback. Changing a Vercel environment variable requires the hosting platform to apply it; operators must verify the deployed value.

The browser sends only audio duration and connection-error counts to `/api/guest/usage`; event IDs make retries idempotent. It never sends audio or transcript text to the usage endpoint. Firestore usage documents are keyed by guest session, so normal classroom traffic does not update a single run-wide counter. An authenticated teacher can query `/api/admin/usage` for run aggregates and approximate USD usage. Browser-reported duration may be incomplete or manipulated; provider dashboards are authoritative for billing and remaining credits.

## Local verification

| Check | Result | Evidence |
|---|---|---|
| 400 guests on one public IP | PASS | Firestore Emulator created 400 distinct cookie-bound sessions in one run, with no fixed slots. |
| 100 simultaneous starts | PASS | 100 synthetic starts completed in the emulator with no central guest counter. |
| 4,000 question grants and 100 retries | PASS | 400 guests × 10 mocked token grants plus 100 retries, all HTTP 200; distributed usage documents counted 4,100 grants. No provider audio or AI was called. |
| Per-session burst control | PASS | 21 simultaneous grants from one guest yielded 20 HTTP 200 and one HTTP 429 in one minute. Other guests were unaffected. |
| Teacher record retrieval | PASS | The previous endpoint stopped at 100 records. Cursor pagination now retrieves all 400 synthetic completed records across eight 50-record pages in the emulator. |
| Local bounded Speech Lab | PASS | Two emulator-only trial grants succeeded; the third was rejected. |
| Firestore direct-client rules | PASS | Emulator denied anonymous and authenticated direct client access. Deployed rules were not changed by this task. |
| API and security tests | PASS | 45 server unit tests and 9 Firestore Emulator tests. |
| Client tests, lint, typechecks, build | PASS | 31 client tests, including multi-page teacher loading; lint and client/server typechecks passed; production build passed. |
| Production dependency audit | PASS | `npm audit --omit=dev` found 0 vulnerabilities. |
| Secret scan and MP3 count | PASS | Git history scan found no leaks; all ten tracked MP3 files remained present. |

The emulator tests prove application transaction behaviour, not hosted Firestore, Deepgram or Vercel throughput. No real paid transcription or evaluation was used during this load test. The 400 sessions represent sequential batches of 25; the independent 100-start test is the simultaneous-start evidence. No cross-session answer or transcript data was submitted in the load test. Existing idempotency tests verify that an identical completed assessment reuses one model result and changed Request IDs are rejected.

## Cost and external limits

At the [published Deepgram Nova-3 monolingual pay-as-you-go rate](https://deepgram.com/pricing) of $0.0077 per streamed minute, 400 pupils speaking for eight minutes each would cost about **$24.64** before any account-specific terms or extra connections. At the [published OpenRouter Haiku 5.5 rate](https://openrouter.ai/anthropic/claude-haiku-5.5/providers) of $0.10 per million input tokens and $0.50 per million output tokens, a sample 3,000-input/1,000-output-token evaluation is about **$0.0008**, or **$0.32 for 400** successful calls. These are planning estimates, not measured usage or a spending guarantee; retries, actual token counts, price changes and account terms can change costs. The owner-stated $200 Deepgram promotional balance and maximum $5 OpenRouter funding must be checked in the respective dashboards before use. Do not enable auto-recharge.

The application has no 400-stream audio queue or cap. The actual Deepgram project's concurrent-stream allocation, the school's uplink/headset performance and Vercel serverless concurrency are **unverified** by these mock tests. The practical maximum simultaneous paid streams is therefore **unverified**. The verified application-only capacity is at least 400 issued guest sessions and 100 simultaneous starts in the emulator, with 4,100 mocked grant operations. A classroom operator should check account limits and provider balance, keep `/api/admin/usage` open in a protected teacher session, and be ready to set `PAID_OPERATIONS_ENABLED=false` if billing or reliability changes unexpectedly.

## Release verification

Publication and hosted API checks will be recorded after deployment. No run reset, record deletion, rule change, provider purchase or paid load call is part of this change.
