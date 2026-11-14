# Deepgram official integration review — 14 November 2026

## Decision

**Private source update: GO. Classroom deployment: NO-GO.** The current release still lacks approved school hosting eligibility, hosted Firebase Admin workload identity and a funded OpenRouter evaluation path. No live audio, paid AI call, pupil record or production Firestore write was used in this review.

## Official contract checked

Reviewed Deepgram's [Speech-to-Text skill](https://github.com/deepgram/skills/blob/main/skills/speech-to-text/SKILL.md), [API skill](https://github.com/deepgram/skills/blob/main/skills/api/SKILL.md), [documentation skill](https://github.com/deepgram/skills/blob/main/skills/docs/SKILL.md), [streaming API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [temporary-token guide](https://developers.deepgram.com/guides/fundamentals/token-based-authentication), [Finalize](https://developers.deepgram.com/docs/finalize), [CloseStream](https://developers.deepgram.com/docs/close-stream), [interim results](https://developers.deepgram.com/docs/interim-results), [raw-audio format](https://developers.deepgram.com/docs/determining-your-audio-format-for-live-streaming-audio) and [browser WebSocket protocol](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol). The native browser WebSocket remains appropriate; no SDK dependency was added.

The client uses `wss://api.deepgram.com/v1/listen`, `model=nova-3`, `language=en-GB`, `interim_results=true`, `encoding=linear16` and the actual AudioContext sample rate. The worklet sends mono signed 16-bit PCM. Browser authentication uses `Sec-WebSocket-Protocol: bearer, <short-lived JWT>`; the server obtains the JWT from `/v1/auth/grant` with the permanent key kept server-side. A JWT is required only at connection setup. `smart_format=true` and `punctuate=true` are set; the latter is redundant but harmless. No keyterm or other paid add-on is enabled in the Speech Lab.

## Confirmed defects corrected

1. Speech Lab WER included provisional words. It now uses confirmed `is_final` text only and shows any remaining provisional words separately in the run details.
2. Stop waited for `from_finalize`, which Deepgram does not guarantee, then closed the socket immediately after `CloseStream`. Stop now acknowledges the AudioWorklet's final PCM flush, sends `Finalize` and `CloseStream`, accepts delayed final Results, waits for the server's close event, and has bounded flush/close timeouts. A timeout or interrupted stop displays a review warning; it never promotes interim text.

The student interview remains Nova-3 by default. The Speech Lab is development-only, while its two-session and 90-second limits do not apply to an ordinary interview. Next/Skip/Finish await the recording stop before changing questions. The existing per-question callback guard prevents late results from entering the next answer.

## Local verification

| Check | Result |
| --- | --- |
| Lint, client and server typechecks | PASS |
| Angular tests | PASS: 27 |
| Server tests | PASS: 34 |
| Firestore emulator deny-all and synthetic concurrency/limits | PASS: 8 |
| Production build | PASS: 366.98 kB raw initial bundle, Node 24 |
| Production dependency audit | PASS: 0 reported vulnerabilities |
| Source preflight and gitleaks history scan | PASS: 10 MP3 files present, `.env.local` ignored, 6 commits scanned, no leaks found |

The sandboxed build exited 134 with no diagnostic; the same production build passed outside the sandbox. The sandboxed npm audit could not resolve the registry; it passed with network access. The Firestore checks used only a local emulator and synthetic identities. No physical iPad or real Deepgram stream was retested, so this review does not establish live recognition accuracy or hosted reliability. Verify those separately before classroom activation.
