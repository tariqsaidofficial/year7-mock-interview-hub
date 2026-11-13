# Zero-spend AI and feedback testing

Owner instruction (2026-11-13): OpenRouter credits are not funded. Do not purchase credits and do not call the paid production model.

## Production model is unchanged

- `anthropic/claude-haiku-5.5`, reasoning effort `medium`.
- Strict JSON Schema and server-side evaluation validation remain the approved production behaviour.
- The `$5 TOTAL` key limit is a spend ceiling, not a funded balance.
- No mock output is evidence that Haiku produces pedagogically accurate feedback.

## Zero-dollar tests first

1. Unit tests: supply fabricated model outputs to `validateEvaluation` for four correctly ordered categories, the three indicators, 0/1/2 strengths and an achievable next step. Include cases with blank, off-topic, short and irrelevant answers.
2. Test server failures without network or provider calls: missing key, response 503, malformed JSON, provider timeout, duplicated requests, identical retry and changed-answer retry.
3. Frontend UI: use Playwright or equivalent route interception of `/api/evaluate`. Use `fixtures/mock-feedback.json` ONLY as a synthetic success fixture; include failed and incomplete outcomes. Ensure the loading animation stops in every path, answer text remains editable/copyable, and refresh restores the report.
4. Teacher UI: mock session/records APIs for rendering and filters, and separately test server authorisation with test doubles/local emulator. Never use a real pupil identity.
5. Document test outputs, screenshots and device details. Mark all mocked results `SIMULATED / NOT REAL AI` in evidence records.

## Optional standalone OpenRouter free-model experiment AFTER the other checks

OpenRouter's `:free` chat-model variants can have zero model price and can be invoked without buying credits, subject to availability and rate limits. In November 2026 its free-model list describes 50 requests/day and 20 requests/minute for free variants with unfunded accounts, with failed calls counted. Provider/model terms can permit retention/training of inputs. Use ONLY fabricated interview answers and a read-only zero-price check. Never send actual student names, answers or data.

- Explicitly verify current model ID has `:free` suffix and input/output price $0 at the time of the experiment.
- Run in an isolated test script or test-only mock adapter, **not** by overriding `OPENROUTER_MODEL` in production, because `server/openrouter.ts` rejects models other than approved Haiku.
- Do not silently relax JSON Schema, strict validation, provider requirements or content constraints to make a free model pass.
- Record model ID, provider, attempted requests, status, latency, output validity and any privacy warning.
- A free-model PASS cannot replace a subsequent authorised production Haiku end-to-end test.

Sources:
- https://openrouter.ai/collections/free-models
- https://openrouter.ai/support/
