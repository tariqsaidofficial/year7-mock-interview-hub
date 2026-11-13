# Authentication removal: local security review

Date: 12 November 2026. This is a local implementation and test report only. No Firebase project, Firestore database, deployed rule, live record, cloud credential, GitHub repository or Vercel deployment was changed.

## Architecture

Firebase browser Authentication and `/api/config` have been removed. Students draft without an account and receive a server-issued guest session when they submit online. Both guest and administrator sessions are 256-bit opaque cookies with `__Host-`, `Secure`, `HttpOnly` and `SameSite=Strict`. Only a keyed digest is stored in Firestore. Sessions are scoped to the active run, role, expiry and keyed client-address digest; revocation and expiry fail closed. Origin validation and a separate rotating CSRF token protect writes. A different IP, a revoked cookie or an expired cookie is rejected. A stolen cookie and CSRF token on the same network remain a residual risk, as with any browser session; an XSS audit and security headers remain important.

The direct `firebase` runtime package is removed; `firebase-admin` remains server-side. The development-only Firestore rules test package still brings Firebase client/Auth modules transitively into `package-lock.json` for emulator testing. No application source imports Firebase Auth, and the production dependency tree contains no direct Firebase browser SDK.

Guest creation requires `INTERVIEW_RUN_OPEN=true`, a per-run quota and a configurable per-IP hourly quota enforced with Firestore transactions. The per-IP default equals the run quota to support a shared school NAT. Evaluation is blocked when the run is closed. One record ID per session per run retains the original Request ID and payload fingerprint. Exact retries return the completed result; altered retries are rejected. Failed model calls retain answers and permit at most two provider attempts. The classroom's maximum provider-call exposure remains proportional to the configured guest quota; this is not a billing guarantee.

Administrator login uses a server-only scrypt hash (N=32768, r=8, p=3, 16-byte random salt), a generic credential error and transactional five-per-IP / 30-global attempts per 15 minutes. Successful login rotates an existing administrator session. Records require an admin cookie. Clear requires admin cookie, origin, CSRF, exact run ID and a closed run; logout revokes the stored session. No password, session token or service-account credential is placed in browser source or Firestore records.

The existing named Firestore database and Firebase Admin SDK remain. The local `firestore.rules` denies all client reads/writes and was not changed. Live deployed rules, IAM scope and real service-account privileges were not inspected. Official Firebase documentation confirms server libraries bypass Security Rules and are governed by IAM: https://firebase.google.com/docs/firestore/security/rules-conditions and https://firebase.google.com/docs/firestore/security/iam. Vercel documents its trusted forwarded client IP behavior: https://vercel.com/docs/headers/request-headers. Before deployment, verify the target Vercel ingress/header behavior and Firestore IAM against the actual project.

## Legacy PIN audit

A source search found no application read or write of `schoolSettings/config` or `adminPin`. Only a Firestore rules test fixture names those fields to assert denial. This review did not read or inspect the live document or its value. The live document may still exist. Safe retirement: inspect deployed rules and any separately deployed legacy code without opening the PIN value; disable legacy PIN routes; rotate any reused secret; obtain retention approval; then separately review and execute field/document removal. Do not copy or log the PIN.

## Validation and residual gates

Local checks: lint, client/server typechecks, 17 Angular tests, 27 server tests, one Enterprise Native Firestore emulator rules test and production build passed. Production dependency audit reported zero vulnerabilities. Tests cover guest issue, expiry, revoked-token replay, IP binding, origin/CSRF rejection, guest quotas, administrator password and login rate limits, unauthorised records/clear, closed-run deletion, exact deletion confirmation, duplicate evaluation, changed retry rejection, two failed provider attempts and draft preservation. Vercel local functions, browser journeys, live IAM/rules and actual provider requests were not exercised in this task. No real pupil data was used.

Configuration required before any release: exact HTTPS `APP_ORIGIN`; strong, unique `SESSION_PEPPER`; a new long administrator password and `ADMIN_PASSWORD_HASH`; run ID, open/closed state and class-size quotas; existing Firestore Admin credentials with least-privilege IAM; and server-side OpenRouter key and spend controls. Avoid opening the run until deployed rules and operational checks pass. A network change invalidates a bound session and preserves the local pupil draft; the teacher must help with recovery. Session and security-counter documents require a separate approved retention cleanup.

## Files changed

- Removed: `src/app/firebase.ts`, `api/config.ts`.
- Added: `src/app/session.ts`, `server/session.ts`, `api/guest/session.ts`, `api/admin/login.ts`, `api/admin/session.ts`, `api/admin/logout.ts`, `qa/session-security.test.ts`, `scripts/hash-admin-password.mjs`, this report.
- Updated: `server/firebase-admin.ts`, `api/evaluate.ts`, `api/admin/records.ts`, `api/admin/clear.ts`, `src/app/interview.service.ts`, `src/app/interview.service.spec.ts`, `src/app/app.ts`, `src/app/app.html`, `src/app/interview.models.ts`, `qa/api-auth.test.ts`, `qa/teacher-auth.test.ts`, `qa/evaluate-idempotency.test.ts`, `package.json`, `package-lock.json`, `.env.example`, `README.md`.
