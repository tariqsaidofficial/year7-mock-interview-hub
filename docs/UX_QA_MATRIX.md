# UX, device and functional acceptance matrix

Use SYNTHETIC names and answers throughout. Record actual browser, device, OS, network and date for every manual run. No pupil data and no paid AI.

| ID | Test | Steps | Pass condition | Evidence |
| --- | --- | --- | --- | --- |
| UX-01 | Welcome screen | Open root route on desktop, 1180px tablet simulator, 375px mobile | Sunmarke styling, four topic cards, no horizontal overflow or clipped controls | Screenshots |
| UX-02 | Setup | Try empty/too-short name and form, then valid synthetic name | Clear field errors; no user account required | Video or notes |
| UX-03 | Closed run | Keep `INTERVIEW_RUN_OPEN=false`, follow start/finish path without any real submissions | Pupil sees truthful, early availability warning, or a documented acceptable fallback; never misleading promised AI | Browser capture |
| UX-04 | Ten questions | Navigate every Q1-Q10, Back and Next, skip, edit then revisit | Exact texts, correct category, no answer lost or duplicated | Test log |
| UX-05 | Timer | Start 08:00, advance beyond 00:00 | Soft guide only; input, navigation and manual Finish remain active | Timer screenshots |
| UX-06 | Narration | Listen q01 through q10, replay and navigate while playing | Exact spoken wording, only one MP3 at once; no stray audio in next question | Human listening log |
| UX-07 | iPad audio | Use real iPad Safari with headphone/volume and gesture playback | Text always readable and Replay usable if autoplay blocked | Device result |
| UX-08 | Speech transcribing | Record 45-60 seconds of natural British English on Chrome and iPad Safari | No double final segment; no missing manually typed text; speech stays with current question | Written expected vs observed transcript |
| UX-09 | Misheard word | Speak pairs of similar-sounding English words; manually correct text | Correction persists; microphone cannot overwrite student correction unexpectedly | Notes |
| UX-10 | Interrupt recognition | Speak, stop, immediately move Next/Back, retry mic | No late onresult text in other question, no audio cross-talk | Test log |
| UX-11 | Microphone readiness | Tap Test microphone on supported and denied devices | Clearly says access vs transcription accuracy, not 'microphone ready' as a guarantee of recognition | Screenshot |
| UX-12 | Offline recovery | Turn off Wi-Fi, fill answers, refresh, reconnect | Draft retained, no forced reset or unexpected automatic paid evaluation | Test log |
| UX-13 | Mock feedback | Intercept `/api/evaluate` in E2E test using schema-valid synthetic response | Loading appears; actual fixture cards; copy; refresh recovery; clear removes local data | Browser test output |
| UX-14 | Error recovery | Mock 404 HTML, 503 JSON, 429 and hanging fetch | User-friendly messages; original answers remain; Retry usable; no endless spinner | E2E result |
| UX-15 | Insufficient evidence | Mock blank and off-topic answers using explicit 'Not enough evidence' data | No fabricated strengths or made-up grades | Snapshot |
| UX-16 | Admin unauthorised | Request records and deletion without admin cookie | 401/403, no information disclosure | API output |
| UX-17 | Admin valid | Sign in using private test password; review synthetic results | Filters, answers and summary render accurately | Video/notes |
| UX-18 | Admin deletion | Close run, confirm run ID, delete synthetic records | Verified count, records gone; retained session/counter data disclosed accurately | Test log |
| UX-19 | UX on 30 devices | Simulate/coordinate 30 sessions only with approval and test data | No unexpected run exhaustion from shared school IP, acceptable latency, no extra fees | Load test |
| UX-20 | Accessibility | Keyboard-only use, screen reader announcements, reduced motion | Usable without mouse, animations respect preference | Checklist |

## Results on 13 November 2026

Chrome 157 headless on macOS 26.6.2 used synthetic data and intercepted API responses. The 1180px and 375px checks were viewport simulations, not physical iPad tests. Temporary screenshots and scripts remained outside the repository.

| IDs | Result | Evidence and limit |
| --- | --- | --- |
| UX-01 | PASS, simulated widths | Desktop, 1180px and 375px showed no horizontal overflow; desktop welcome and question/mobile screenshots were visually reviewed. |
| UX-02 | PARTIAL | Valid synthetic setup completed; invalid-field prompts were not walked through in the browser. |
| UX-03–05 | PASS, mocked browser | Closed-run warning appeared before setup; ten fixed questions, Back/Next and retained answer; timer reached zero without submission. |
| UX-06 | PARTIAL | Browser requested q01–q10 successfully; all ten files decoded and matched the build. Human listening and exact spoken words remain unverified. |
| UX-07 | UNVERIFIED | No physical iPad Safari was available. |
| UX-08–10 | PARTIAL | Unit test covers cumulative final/interim segments and stale callbacks after stop. Browser engine word accuracy, homophones and live recording were not tested. |
| UX-11 | PARTIAL | Permission message now states its limit; live microphone readiness was not exercised. |
| UX-12 | PARTIAL | Draft recovery unit test passed; browser offline/reconnect journey was not exercised. |
| UX-13–14 | PASS, mocked browser | Clearly marked simulated feedback, copy/refresh/clear, 429/503/HTML errors, hanging request and retained answer were exercised. |
| UX-15 | PARTIAL | Contract unit tests cover blank/partial/unrelated answers; full browser fixture variants were not all exercised. |
| UX-16 | PASS, mocked server | Existing unauthorised-record and deletion tests passed; live hosted API was not tested. |
| UX-17–18 | PASS, mocked browser only | Mock teacher record/detail/filter and confirmed deletion passed; live hosted auth and Firestore remain unverified. |
| UX-19 | UNVERIFIED | No 30-device load or cost test was run. |
| UX-20 | PARTIAL | Reduced-motion browser check passed; keyboard and screen-reader walkthroughs remain unverified. |

## Transcript QA protocol

- Keep `en-GB` and the existing engine for baseline.
- Collect ground-truth sentence written by consenting adult tester and recognized text only. Never store raw student audio for this check.
- Mark substitutions, deletions, insertions and segment repetition separately.
- First eliminate transcript-assembly defects. If misrecognition remains, compare a standalone alternative engine. Do not assume a JavaScript library changes the browser's recognition accuracy.
- Preserve editable textarea and make 'Check your answer before moving on' clear but unobtrusive.

## AI test order

1. Unit tests and deterministic fixtures: entirely offline, $0.
2. API/E2E HTTP interception: simulated success, error, timeout, blank, partial and off-topic, $0.
3. OPTIONAL standalone test script of a currently advertised `:free` chat model, with synthetic inputs and verified zero input/output prices; it must not replace Haiku or silently route to a paid model. Stop on schema incompatibility or rate limit.
4. Paid Haiku test ONLY after the user funds and explicitly authorises it.
