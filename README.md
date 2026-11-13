# Year 7 Mock Interview Hub

**Private source-review candidate.** Local checks and mocked journeys do not authorise classroom use. Hosted Firebase/Vercel authentication, retention, browser speech accuracy and an owner-approved production AI evaluation remain separate release gates.

Angular 21 browser app with ten fixed questions, approved MP3 question audio, optional speech recognition, an eight-minute guide timer, local draft recovery, OpenRouter feedback and a protected teacher record view. Students do not create accounts. Firebase Authentication is not used.

## Server-side security model

- `/api/guest/session` issues a 256-bit random guest cookie only while `INTERVIEW_RUN_OPEN=true`. The cookie is `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict` and lasts 12 hours. The browser obtains a CSRF token separately. Session tokens are never saved in plaintext; the Admin SDK stores keyed token digests and a keyed client-address digest in the existing named Firestore database. A refresh can request a new CSRF token. A revoked, expired or different-address cookie is rejected. A pupil changing networks must ask the teacher for help; the local answer draft remains available.
- Guest issuance is bounded by a per-run ceiling (`MAX_GUEST_SESSIONS`, maximum 100) and a configurable per-IP hourly ceiling (`MAX_GUEST_SESSIONS_PER_IP`). The default per-IP ceiling equals the run ceiling so a shared school network does not block the class; set a lower value only when the network layout is known. Firestore transactions enforce these limits across serverless instances. The run must remain open for evaluation. Closing it prevents new sessions and submissions. A student can draft answers offline, then obtain a guest session when submitting online.
- The welcome action checks `/api/guest/availability` before setup. A closed run or an unavailable API gives an early explanation, so pupils do not complete ten questions before discovering that feedback cannot be submitted.
- `/api/evaluate` checks guest session, exact origin, CSRF token, answer schema and size. A single record ID derived from the session digest exists per run. The first request fixes its Request ID and answer fingerprint. Identical retries return the saved result; changed requests are rejected. At most two provider attempts are allowed after failures. Pending requests use a lease. OpenRouter receives answers only, never pupil name or tutor group.
- `/api/admin/login` verifies a server-only scrypt password hash after a transactional limit of five attempts per IP and 30 overall per 15 minutes. It rotates an existing administrator session on successful login. Administrator cookies last two hours. Records, deletion and logout require a valid administrator session; deletion also needs origin, CSRF, exact run confirmation and a closed run. Logout revokes the server-side session.
- All Firestore reads and writes use the server Admin SDK with Google Application Default Credentials (ADC), an explicit server-only `FIREBASE_PROJECT_ID`, and the existing named `FIRESTORE_DATABASE_ID`. `firestore.rules` denies all direct client access. The Admin SDK bypasses these rules, so restrict the ADC identity through Firestore IAM to the existing named database and only the access needed for this app. Verify the *deployed* rules and IAM before release; this repository cannot prove their live state. Never grant client access to session or counter collections.
- The browser stores an answer draft locally for up to 24 hours. Finish and clear removes local draft and feedback. The teacher must explicitly clear central run records. Session and rate-counter documents remain until the school's approved retention cleanup; this task does not alter live data or configure TTL.

## Configuration

Use Node 24.12+ and `npm ci`. Enter `.env.example` values privately in the intended hosting environment. Set `FIREBASE_PROJECT_ID=gen-lang-client-0286975933` and keep `FIRESTORE_DATABASE_ID` pointed at the existing named database. ADC must be available to the server runtime; no JSON private key is required or permitted. Never commit `.env`, `SESSION_PEPPER`, the administrator hash or OpenRouter key. Generate a random 32-byte or longer `SESSION_PEPPER`; keep it stable for the run. Set `APP_ORIGIN` to the exact HTTPS origin used by the class. The run ID must be unique for each activity. Keep `INTERVIEW_RUN_OPEN=false` until the teacher opens the run. Limit `MAX_GUEST_SESSIONS` to the expected class size plus a small allowance.

For future Vercel hosting, configure Google Workload Identity Federation with Vercel OIDC so server functions obtain short-lived Google credentials for ADC without a private key. This is a separate deployment configuration task; it is not configured by this repository change. Verify the Google trust mapping, IAM scope and runtime credentials before release.

Generate a unique 20+ character administrator password and its hash in a private terminal with `node scripts/hash-admin-password.mjs`. Store only the generated `ADMIN_PASSWORD_HASH` in server environment configuration. Do not reuse the legacy PIN. Changing the hash does not invalidate an already issued two-hour administrator session; close the run and rotate `SESSION_PEPPER` as part of an emergency credential rotation.

For a local **UI-only simulation**, stop any existing server on port 3000 and run `npm run dev:mock`, then open `http://localhost:3000`. If port 3000 is occupied, run `MOCK_UI_PORT=3002 npm run dev:mock` and open `http://localhost:3002`. This starts Angular and a loopback-only mock API. It opens the setup flow and returns clearly labelled simulated feedback; it does not use Firestore, authenticate a teacher, evaluate answers with AI, or prove server security. `npm run dev` and `npm start` run Angular alone, so `/api/*` does not work there. For real same-origin API testing, use `vercel dev` with a linked test project and private local environment. The OpenRouter model remains `anthropic/claude-haiku-5.5` with medium reasoning. Verify a maximum USD 5 key spend limit and disabled automatic recharge before any paid synthetic test. No paid request is made by the automated tests.

## Legacy `adminPin` retirement

Current application source has no read of `schoolSettings/config` or `adminPin`; the only reference to that field is a deny-all Firestore rules test fixture. The legacy document may still exist in the live database. This task did not inspect its value or mutate it. An authorised operator should first verify deployed rules deny direct access and inventory any separately deployed legacy code, then disable legacy PIN routes, rotate any reused secret, obtain the school's retention approval, and remove the field/document through a separately reviewed maintenance action. Never copy, log or expose the PIN during that audit.

## Local validation

```sh
npm run lint
npm run typecheck
npm run typecheck:server
npm test -- --watch=false
npm run test:server
npm run build
npm audit --omit=dev
```

For Firestore rules, run the existing emulator test with `FIRESTORE_EMULATOR_HOST` set to a local emulator only. Do not run it against production. Private GitHub publication is source backup and review; it does not deploy or approve classroom use.
