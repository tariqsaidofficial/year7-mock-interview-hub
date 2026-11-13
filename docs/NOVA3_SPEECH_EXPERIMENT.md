# Nova-3 speech proof of concept — local experiment

**Branch:** `experiment/nova3-speech` (local only). The production interview continues to use browser `SpeechRecognition`. This experiment is not a release approval.

## What was built

- An experiment-branch diagnostic at `/?speech-lab` with an adult-consent gate, exact per-run reference text, separate Browser SpeechRecognition and Nova-3 runs, transcripts and WER. It keeps data in page memory only; closing the tab removes it.
- A `Nova3SpeechService` with the same start/stop/status/listening shape as the existing Angular service. It sends actual `AudioContext.sampleRate` with 16-bit mono PCM from an `AudioWorklet`; the browser cannot silently label 44.1 kHz audio as 16 kHz. The audio worklet runs on Chrome and browsers with the iPad Safari AudioWorklet/WebSocket/secure-context APIs. Actual physical iPad operation remains untested.
- A CSRF-protected guest endpoint that exchanges a server-only `DEEPGRAM_API_KEY` for Deepgram's 30-second access token. The permanent key is never sent to the browser. Firestore transactions cap issuance to 3 per guest/minute, 60 per run/minute, 12 per guest/run and 480 per run. The classroom must be open.
- Confirmed and provisional transcript state is separate. Final segments persist through pauses and one reconnect. Manual stop flushes pending PCM, sends `Finalize`, waits for a final result or a bounded timeout, then closes. If the provider does not finalise, provisional words remain visible and are flagged for review. `cancelRecognition()` invalidates callbacks immediately when a question/context changes.

No raw audio is written to Firestore, localStorage or this repository. Typing remains available. No real pupil audio may be used in this experiment.

## How to compare with adults

1. Obtain adult consent and a separate Deepgram test project/key. Configure the key only in a private server environment. Keep `INTERVIEW_RUN_OPEN=true` only for the bounded synthetic run and use a synthetic guest identity. The local `dev:mock` command intentionally returns 503 for token issuance; it cannot measure Deepgram accuracy.
2. Run the application under a configured `vercel dev` environment with same-origin HTTPS for a physical iPad. Open `/?speech-lab`. Never type a key into the page.
3. For each scenario below, enter the **exact words actually spoken**, including deliberate repetitions, into the reference field. Run each engine separately using the same script at a comparable pace. Do not count a speaker's repeated words as recogniser insertions if they were spoken.
4. Record WER per engine, time to first final result, missing final segments, connection errors, Chrome version, Safari/iPadOS version and microphone used. Repeat each scenario enough times to avoid judging from a single utterance. Keep reference/transcript pairs outside school systems only under the approved adult-test procedure.

| Adult speech scenario | Browser WER | Nova-3 WER | Latency / lost finals / errors | Result |
|---|---:|---:|---|---|
| Natural British English | Not run | Not run | Not measured | No accuracy conclusion |
| Non-native English | Not run | Not run | Not measured | No accuracy conclusion |
| Continuous speech | Not run | Not run | Not measured | No accuracy conclusion |
| Deliberate pauses | Not run | Not run | Not measured | No accuracy conclusion |
| Short answers | Not run | Not run | Not measured | No accuracy conclusion |
| Similar-sounding words | Not run | Not run | Not measured | No accuracy conclusion |
| Longer responses | Not run | Not run | Not measured | No accuracy conclusion |

The browser mock test used a synthetic transcript and produced 0% WER by construction. **That is a software-contract test, not recognition accuracy evidence.** No adult speech, provider request, or physical iPad test occurred in this implementation session.

## Decision threshold and 30-session plan

Recommend production integration only after the same consented-adult corpus shows a meaningful reduction in aggregate WER (target at least 20% relative), no material regression in any scenario, no lost confirmed segments, acceptable first-final latency and errors, and a successful physical iPad Safari test. A teacher must review the reference/transcript pairs. Even if those pass, approval of external adult/pupil audio processing is separate.

The local token gate permits 30 simultaneous first connections within its 60-per-minute run ceiling. Deepgram's public Pay-as-You-Go documentation currently lists **up to 150 concurrent Nova-3 streams per primary project**, but secondary self-serve projects can be limited to **one**. The actual test account's project tier, region, available concurrency, billing cap and rate-limit responses have **not** been verified. Before any 30-device classroom test, confirm the actual project limit in Deepgram, keep a 30+reconnect margin, run 30 consented/synthetic concurrent connections, measure 429s and finalisation, and set an approved cost ceiling. Do not bypass a limit with extra projects.

## Local verification

- Lint, client/server typechecks, 21 Angular tests and 33 server tests passed on the experiment branch.
- Chrome headless with a localhost mock API: adult-consent gate and safe 503 token failure passed; no request reached Deepgram.
- Chrome headless with a fully mocked WebSocket: interim/final assembly, `Finalize` on stop and synthetic WER calculation passed. No real audio was sent externally.
- Live Deepgram WER, provider limits, physical iPad Safari, 30 concurrent sessions and production speech replacement: **NOT RUN**.

Primary references: [Deepgram temporary token grant](https://developers.deepgram.com/guides/fundamentals/token-based-authentication), [Nova-3 live audio](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [audio encoding](https://developers.deepgram.com/docs/encoding/), [current rate limits](https://developers.deepgram.com/reference/api-rate-limits).
