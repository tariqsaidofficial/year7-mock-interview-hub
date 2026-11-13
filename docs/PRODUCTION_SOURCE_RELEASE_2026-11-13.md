# Year 7 Mock Interview Hub: production source release

13 November 2026. Owner decision: Deepgram Nova-3 is the primary speech engine. The owner's comparison supports that choice, but the lab reference text was not consistently identical to the speech, so no accuracy percentage is claimed.

## Source decision

**Source GO for private GitHub review; classroom activation NO-GO.** The normal interview uses Nova-3 without a query flag. The adult Speech Lab is restricted to Angular development mode; its two-session/90-second cap does not apply to normal interview recording. No pupil recording, paid Deepgram transcription, OpenRouter request or production Firebase mutation was made for this release.

The ten fixed questions, ten MP3 files, four categories, eight-minute soft countdown, feedback format, draft recovery and teacher view are retained. The server continues to require guest sessions, same-origin CSRF and bounded temporary Deepgram grants. The browser stores only confirmed speech in answers; provisional words remain visible separately. Typing remains available.

## Verified locally

| Gate | Result |
| --- | --- |
| Lint, client/server typechecks | PASS |
| Angular tests | PASS: 24 tests, including primary-engine and offline microphone-stop checks |
| Server tests | PASS: 34 tests |
| Firestore Enterprise emulator | PASS: 1 deny-all rules test and 7 synthetic concurrency/limit tests |
| Production build | PASS |
| Production dependency audit | PASS: 0 reported vulnerabilities |
| Chrome synthetic pupil/teacher journeys | PASS: ten questions and MP3 requests, Back/Next/Skip/Replay/Finish, countdown, simulated feedback, refresh, local clear, teacher filter and confirmed synthetic deletion |
| Browser microphone lifecycle | PASS with fake microphone, intercepted Deepgram WebSocket and mocked feedback: setup test plus two interview recordings made three sockets, two Finalize messages, no late words entered the next question |
| Public build Speech Lab gate | PASS: `/?speech-lab` renders the normal welcome page in a production build |

These browser checks are synthetic. They do not prove actual provider accuracy, a physical iPad Safari flow, a 30-device class, hosted Vercel functions or real AI feedback. The ten MP3 files were checked for presence and integrity; a human listening review remains separate.

## Hosted activation blockers

1. **Hosting eligibility:** The available Vercel team is on Hobby. Vercel's [Hobby terms](https://vercel.com/legal/terms) restrict it to personal or non-commercial use. Obtain a school-approved eligible arrangement before creating a school-use deployment.
2. **Keyless Firebase identity:** Local ADC works, but no hosted Vercel OIDC to Google Workload Identity Federation trust, scoped IAM or named-database runtime test is configured. Follow the [Vercel GCP federation guide](https://vercel.com/docs/oidc/gcp); do not create a service-account private key.
3. **Evaluation funding:** OpenRouter has no funded credit. Keep `anthropic/claude-haiku-5.5` with medium reasoning and test a funded synthetic evaluation after the owner configures billing. Until then, the classroom feedback endpoint is not operational. Do not replace the model or present mock feedback as real.
4. **Production configuration:** Hosting secrets, exact HTTPS `APP_ORIGIN`, run ID, closed-run setting, administrator hash, session pepper, Deepgram key, Firebase project/database IDs and OpenRouter key need private configuration and hosted verification. Never set `DEEPGRAM_LIVE_TRIAL` or `FIRESTORE_EMULATOR_HOST` in production.
5. **School data governance:** Confirm retention, data region and supplier processing approval before collecting pupil answers. Verify the actually deployed deny-all client rules and least-privilege server IAM separately.

The source may be merged to private `main` while these deployment gates remain closed. No Vercel deployment or classroom run activation is authorised by this document.
