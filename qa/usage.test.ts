import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../server/http';

const mocks = vi.hoisted(() => {
  const events = new Set<string>();
  const getSession = vi.fn(); const validCsrf = vi.fn();
  const values: Record<string, number> = { audioSeconds: 60, tokenGrants: 10, completedEvaluations: 1, providerErrors: 2, promptTokens: 1000, completionTokens: 500 };
  const aggregate = vi.fn((query: {total: {field: string}}) => ({ get: async () => ({ data: () => ({ total: values[query.total.field] }) }) }));
  const doc = (id: string) => ({ id, collection: (name: string) => ({ doc: (child: string) => ({ id: `${name}/${child}` }), aggregate }) });
  const db = () => ({ collection: () => ({ doc }), runTransaction: async (fn: (tx: { get: (ref: {id: string}) => Promise<{exists: boolean}>; create: (ref: {id: string}) => void; set: () => void }) => Promise<unknown>) => fn({ get: async (ref) => ({ exists: events.has(ref.id) }), create: (ref) => { events.add(ref.id); }, set: () => undefined }) });
  return { events, getSession, validCsrf, db, aggregate };
});
vi.mock('../server/session', () => ({ getSession: mocks.getSession, validCsrf: mocks.validCsrf }));
vi.mock('../server/firebase-admin', () => ({ db: mocks.db, runId: () => 'synthetic-run' }));
vi.mock('../server/usage', () => ({ usageRef: (id: string) => ({ id: `usage/${id}` }) }));
vi.mock('firebase-admin/firestore', () => ({ AggregateField: { sum: (field: string) => ({ field }) }, FieldValue: { increment: (value: number) => value } }));
function response() { const state: { status?: number; body?: unknown } = {}; return { state, res: { setHeader: vi.fn(), status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; } } as unknown as ApiResponse }; }
const eventId = '00000000-0000-4000-8000-000000000001';
const request = (body: unknown) => ({ method: 'POST', headers: { origin: 'https://class.example', 'x-csrf-token': 'synthetic' }, body } as ApiRequest);

describe('distributed usage monitoring', () => {
  beforeEach(() => { mocks.events.clear(); mocks.getSession.mockReset().mockResolvedValue({ id: 'guest-1' }); mocks.validCsrf.mockReset().mockReturnValue(true); mocks.aggregate.mockClear(); });
  it('rejects unauthorised or transcript-bearing usage reports', async () => {
    const { default: handler } = await import('../api/guest/usage');
    mocks.getSession.mockResolvedValueOnce(null); const absent = response(); await handler(request({ eventId, audioSeconds: 1, providerErrors: 0 }), absent.res);
    mocks.validCsrf.mockReturnValueOnce(false); const denied = response(); await handler(request({ eventId, audioSeconds: 1, providerErrors: 0 }), denied.res);
    const unsafe = response(); await handler(request({ eventId, audioSeconds: 1, providerErrors: 0, transcript: 'never store this' }), unsafe.res);
    expect([absent.state.status, denied.state.status, unsafe.state.status]).toEqual([401, 403, 400]);
    expect(mocks.events.size).toBe(0);
  });
  it('accepts retryable audio metadata exactly once per event', async () => {
    const { default: handler } = await import('../api/guest/usage');
    const input = request({ eventId, audioSeconds: 12.5, providerErrors: 1 });
    const first = response(); await handler(input, first.res);
    const retry = response(); await handler(input, retry.res);
    expect([first.state.status, retry.state.status]).toEqual([200, 200]);
    expect(mocks.events.size).toBe(1);
  });
  it('protects administrator estimates and returns run aggregates', async () => {
    const { default: handler } = await import('../api/admin/usage');
    mocks.getSession.mockResolvedValueOnce(null); const denied = response(); await handler({ method: 'GET', headers: {} } as ApiRequest, denied.res);
    const allowed = response(); await handler({ method: 'GET', headers: {} } as ApiRequest, allowed.res);
    expect(denied.state.status).toBe(401); expect(allowed.state.status).toBe(200);
    expect(allowed.state.body).toMatchObject({ usage: { tokenGrants: 10, completedEvaluations: 1 }, estimatedUsd: { deepgram: 0.0077 } });
  });
});
