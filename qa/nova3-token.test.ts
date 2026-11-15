import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../server/http';

const getSession = vi.fn(); const validCsrf = vi.fn(); const runTransaction = vi.fn();
const doc = vi.fn((id: string) => ({ id }));
const db = vi.fn(() => ({ collection: () => ({ doc: () => ({ collection: () => ({ doc }) }) }), runTransaction }));
const reserveSpeechGrant = vi.fn(); const recordUsage = vi.fn();
vi.mock('../server/session', () => ({ getSession, validCsrf }));
vi.mock('../server/firebase-admin', () => ({ db, runId: () => 'synthetic-run' }));
vi.mock('../server/usage', () => ({ reserveSpeechGrant, recordUsage }));

function response() {
  const state: { status?: number; body?: unknown } = {};
  const res = { setHeader: vi.fn(), status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; } } as unknown as ApiResponse;
  return { state, res };
}
const request = { method: 'POST', headers: { origin: 'https://example.test', 'x-csrf-token': 'test' } } as unknown as ApiRequest;

describe('Nova-3 temporary token gate', () => {
  beforeEach(() => {
    vi.stubEnv('INTERVIEW_RUN_OPEN', 'true'); vi.stubEnv('DEEPGRAM_API_KEY', 'synthetic-server-only-key');
    getSession.mockReset().mockResolvedValue({ id: 'synthetic-session' }); validCsrf.mockReset().mockReturnValue(true);
    reserveSpeechGrant.mockReset().mockResolvedValue(true); recordUsage.mockReset().mockResolvedValue(undefined);
    runTransaction.mockReset().mockImplementation(async (callback) => callback({ get: async () => ({ get: () => 0 }), set: vi.fn() }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('denies absent session and invalid CSRF before contacting Deepgram', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('../api/guest/nova3-token');
    getSession.mockResolvedValueOnce(null); const absent = response(); await handler(request, absent.res);
    validCsrf.mockReturnValueOnce(false); const csrf = response(); await handler(request, csrf.res);
    expect([absent.state.status, csrf.state.status]).toEqual([401, 403]); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed for a closed classroom and rate limits token grants', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('../api/guest/nova3-token');
    vi.stubEnv('INTERVIEW_RUN_OPEN', 'false'); const closed = response(); await handler(request, closed.res);
    vi.stubEnv('INTERVIEW_RUN_OPEN', 'true');
    reserveSpeechGrant.mockResolvedValueOnce(false);
    const limited = response(); await handler(request, limited.res);
    expect([closed.state.status, limited.state.status]).toEqual([403, 429]); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('pauses new paid grants without contacting Deepgram', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PAID_OPERATIONS_ENABLED', 'false');
    const { default: handler } = await import('../api/guest/nova3-token');
    const paused = response(); await handler(request, paused.res);
    expect(paused.state.status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('counts a provider failure without exposing the key or losing the answer', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('synthetic network failure')); vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('../api/guest/nova3-token');
    const failed = response(); await handler(request, failed.res);
    expect(failed.state.status).toBe(503);
    expect(recordUsage).toHaveBeenCalledWith('synthetic-session', { providerErrors: 1 });
    expect(JSON.stringify(failed.state.body)).not.toContain('synthetic-server-only-key');
  });
  it('returns only a short-lived grant and never the permanent key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'synthetic.jwt.token', expires_in: 30 }), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('../api/guest/nova3-token');
    const { state, res } = response(); await handler(request, res);
    expect(state.status).toBe(200); expect(state.body).toEqual({ accessToken: 'synthetic.jwt.token', expiresIn: 30 });
    expect(JSON.stringify(state.body)).not.toContain('synthetic-server-only-key');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepgram.com/v1/auth/grant');
  });
  it('requires an emulator and caps the live trial at two grants across the run', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ access_token: 'synthetic.jwt.token', expires_in: 30 }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('DEEPGRAM_LIVE_TRIAL', 'true');
    const { default: handler } = await import('../api/guest/nova3-token');
    const noEmulator = response(); await handler(request, noEmulator.res);
    expect(noEmulator.state.status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8085');
    let trialCount = 0;
    runTransaction.mockImplementation(async (callback) => callback({
      get: async (ref: { id: string }) => ({ get: () => ref.id === 'nova3-live-trial-total' ? trialCount : 0 }),
      set: (ref: { id: string }, value: { count: number }) => { if (ref.id === 'nova3-live-trial-total') trialCount = value.count; },
    }));
    const results = [];
    for (let index = 0; index < 3; index++) { const item = response(); await handler(request, item.res); results.push(item.state.status); }
    expect(results).toEqual([200, 200, 429]); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
