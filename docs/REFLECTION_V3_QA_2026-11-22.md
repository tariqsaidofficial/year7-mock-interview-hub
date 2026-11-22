# Reflection Score / Privacy V3 QA — 22 November 2026

Scope: `feat/privacy-ready-preview-2026-11-17`, based on `fbec6ed`. Preview only; no main merge or Production release. Latest V3 specification is authoritative; the owner explicitly excluded the older UI-finishing document.

## Implemented

- Pure browser TypeScript answer-development-v1, 0–5 per question / 0–50 total. No service, dependency, server schema or qualitative-rubric changes. See REFLECTION_SCORE_V3.md for exact algorithm and limits.
- Live score comes from a snapshot of the actual submitted ten answers. Regression test proves one actual one-word answer produces 1/50, independently of demo fixtures and AI output. V1/missing/ambiguous answer provenance is unavailable. Recovered grounded V2 results are calculated locally, not backfilled into old records.
- Fixed fictional demo answers produce a consistent 50/50 and are visibly labelled DEMO · example score. Visitor edits are never scored/sent/stored by the synthetic Preview.
- Shared two-column hero on all required mobile/tablet/desktop widths; SVG ring, fraction, exact development disclaimer, optional per-question disclosure.
- Privacy V3 preserves the curved wave and approved factual demo/live copy, improves equal desktop cards/mobile horizontal rows, spacing and readable labels, and uses existing UiIcon SVGs with opt-in sizing. Default icon size elsewhere is unchanged.
- Native dialog initial focus now preserves its top artwork; Escape returns focus. Short viewport scrolling and enlarged text supported. Corrected observed enlarged-text wrapping in existing domain cards/header.

## Automated evidence

- Lint and client/server typechecks PASS.
- Client suite: 11 files / 89 PASS (includes pure score boundaries, EAL/concise input, repetition, phrases, future cues, copied prompts/placeholders/HTML, missing/duplicate IDs, deterministic ordering/sum, demo isolation, live snapshot, restored V2 and V1/unavailable provenance).
- Server/API/privacy/no-provider demo suite: 14 files / 57 PASS.
- Firestore Emulator rules/concurrency: 2 files / 9 PASS, demo-only projects, no Production writes. Emulator prints expected denied-access and multiple-demo-project warnings; exit code 0.
- Production build PASS; dependency audit 0 vulnerabilities.
- Source/history/staged secret scans and diff checks required before push; final results in completion report.
- No modifications to Q1–Q10 models, MP3 assets, Nova-3 engine, rubric server prompt, provider privacy/routing, Firebase or session APIs. Existing question/audio and speech regression tests run.

## Browser evidence

Actual local headless Chrome using the production Angular bundle with synthetic mocked APIs. Widths 320/375/390/768/1440; confirm same-row hero, exact fraction/disclaimer, no horizontal page overflow, equal desktop assurance cards and mobile horizontal rows. 200% text enlargement, forced-colors and reduced-motion emulation exercised. 320px short-height modal tested separately; scrollable content and 44px-or-greater disclosure/accept targets. Native Escape and focus return checked. No physical iPad or Safari acceptance claimed. Provider/microphone services were disabled in demo, with zero live paid requests.

Screenshots and raw logs under `/private/tmp/year7-v3-*`; before screenshots from the previously verified fbec6ed UI under `/private/tmp/year7-demo-final-*`. These show real Angular browser renders, not a generated design mockup. Hosted Vercel READY/SHA and API isolation rechecked after push, recorded in the final report.

## Release boundaries

GO applies to this protected synthetic Preview UI. Production still requires the separate named-Firestore Rules mapping, provider real-request privacy verification, school-approved retention/deletion and recovery plan, physical-device acceptance and school release approval. A locally calculated score does not establish semantic answer quality, factual truth, academic attainment or personality. No claim of live provider compliance is inferred from mocks.
