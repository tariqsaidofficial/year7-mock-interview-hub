import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../server/http';
import { QUESTIONS } from '../src/app/interview.models';
const mocks = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const evaluate = vi.fn(async () => ({ formattedCopyableText: 'Synthetic feedback', categories: [], whatWentWell: ['a', 'b'], evenBetterIf: 'c', overallSummary: 'd' }));
  const ref = (uid: string) => ({ uid, update: async (patch: Record<string, unknown>) => { docs.set(uid, { ...docs.get(uid), ...patch }); } });
  const db = () => ({ runTransaction: async (fn: (tx: { get: (r: {uid: string}) => Promise<{ exists: boolean; data: () => Record<string, unknown>; get: (field: string) => unknown }>; create: (r: {uid: string}, value: Record<string, unknown>) => void; update: (r: {uid: string}, value: Record<string, unknown>) => void }) => Promise<unknown>) => fn({ get: async (r) => ({ exists: docs.has(r.uid), data: () => docs.get(r.uid)!, get: (field) => docs.get(r.uid)?.[field] }), create: (r, value) => { docs.set(r.uid, value); }, update: (r, value) => { docs.set(r.uid, { ...docs.get(r.uid), ...value }); } }) });
  return { docs, evaluate, ref, db };
});
vi.mock('../server/firebase-admin', () => ({ recordsCollection: () => ({ doc: mocks.ref }), runId: () => 'demo-run', db: mocks.db }));
vi.mock('../server/session', () => ({ getSession: async (req: ApiRequest) => ({ id: String(req.headers['x-test-session'] || 'student-1'), role: 'guest' }), validCsrf: () => true }));
vi.mock('../server/openrouter', () => ({ evaluate: mocks.evaluate }));
function response() { const state: { status?: number; body?: unknown } = {}; const res = { setHeader: vi.fn(), status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; } } as unknown as ApiResponse; return { state, res }; }
describe('submission idempotency', () => {
  beforeEach(() => { process.env['INTERVIEW_RUN_OPEN'] = 'true'; mocks.docs.clear(); mocks.evaluate.mockReset().mockResolvedValue({ formattedCopyableText: 'Synthetic feedback', categories: [], whatWentWell: ['a', 'b'], evenBetterIf: 'c', overallSummary: 'd' }); });
  it('returns one saved result for repeated identical requests without a second model call', async () => {
    const { default: handler } = await import('../api/evaluate');
    const body = { requestId: crypto.randomUUID(), studentName: 'Synthetic Student', tutorGroup: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: '' })) };
    const request = { method: 'POST', headers: { 'x-test-session': 'student-1' }, body } as ApiRequest;
    const first = response(); await handler(request, first.res);
    const second = response(); await handler(request, second.res);
    expect(first.state.status).toBe(200); expect(second.state.status).toBe(200);
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
  it('rejects a changed request after completion', async () => {
    const { default: handler } = await import('../api/evaluate');
    const body = { requestId: crypto.randomUUID(), studentName: 'Synthetic Student', tutorGroup: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: '' })) };
    const first = response(); await handler({ method: 'POST', headers: {}, body } as ApiRequest, first.res);
    const second = response(); await handler({ method: 'POST', headers: {}, body: { ...body, requestId: crypto.randomUUID() } } as ApiRequest, second.res);
    expect(second.state.status).toBe(409); expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
  it('accepts 30 independent synthetic students concurrently without shared IP throttling', async () => {
    const { default: handler } = await import('../api/evaluate');
    const outcomes = await Promise.all(Array.from({ length: 30 }, async (_, index) => {
      const body = { requestId: crypto.randomUUID(), studentName: `Synthetic ${index}`, tutorGroup: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: '' })) };
      const result = response();
      await handler({ method: 'POST', headers: { 'x-test-session': `student-${index}` }, body } as ApiRequest, result.res);
      return result.state.status;
    }));
    expect(outcomes.every((status) => status === 200)).toBe(true);
    expect(mocks.evaluate).toHaveBeenCalledTimes(30);
    expect(mocks.docs.size).toBe(30);
  });

  it('rejects an oversized request before a paid model call', async () => {
    const { default: handler } = await import('../api/evaluate');
    const body = { requestId: crypto.randomUUID(), studentName: 'Synthetic Student', tutorGroup: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: 'x'.repeat(2000) })) };
    const result = response();
    await handler({ method: 'POST', headers: { 'x-test-session': 'large-student' }, body } as ApiRequest, result.res);
    expect(result.state.status).toBe(400);
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it('bounds failed provider attempts and keeps the submitted answers', async () => {
    const { default: handler } = await import('../api/evaluate');
    const body = { requestId: crypto.randomUUID(), studentName: 'Synthetic Student', tutorGroup: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: q.id === 1 ? 'My synthetic answer' : '' })) };
    mocks.evaluate.mockRejectedValue(new Error('synthetic provider failure'));
    const statuses = [];
    for (let i = 0; i < 3; i++) { const result = response(); await handler({ method: 'POST', headers: {}, body } as ApiRequest, result.res); statuses.push(result.state.status); }
    expect(statuses).toEqual([503, 503, 429]);
    expect(mocks.evaluate).toHaveBeenCalledTimes(2);
    expect(mocks.docs.get('student-1')?.['answers']).toEqual(body.answers);
  });

});
