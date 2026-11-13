import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../server/http';
const getSession = vi.fn(); const validCsrf = vi.fn(); const runId = vi.fn(() => 'demo-run'); const recordsCollection = vi.fn();
vi.mock('../server/session', () => ({ getSession, validCsrf }));
vi.mock('../server/firebase-admin', () => ({ runId, recordsCollection }));
function response() { const state: { status?: number; body?: unknown } = {}; const res = { setHeader: vi.fn(), status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; } } as unknown as ApiResponse; return { state, res }; }
describe('API session gates', () => {
  beforeEach(() => { process.env['INTERVIEW_RUN_OPEN'] = 'true'; getSession.mockReset(); validCsrf.mockReset(); validCsrf.mockReturnValue(true); runId.mockReset(); runId.mockReturnValue('demo-run'); recordsCollection.mockReset(); });
  it('reports classroom availability without creating a guest session', async () => {
    const { default: availability } = await import('../api/guest/availability');
    process.env['INTERVIEW_RUN_OPEN'] = 'false';
    const closed = response(); availability({ method: 'GET', headers: {} } as ApiRequest, closed.res);
    process.env['INTERVIEW_RUN_OPEN'] = 'true';
    const open = response(); availability({ method: 'GET', headers: {} } as ApiRequest, open.res);
    expect(closed.state.body).toEqual({ open: false }); expect(open.state.body).toEqual({ open: true });
    expect(recordsCollection).not.toHaveBeenCalled();
  });
  it('denies a student without a guest session', async () => {
    getSession.mockResolvedValue(null);
    const { default: handler } = await import('../api/evaluate'); const { state, res } = response();
    await handler({ method: 'POST', headers: {} } as ApiRequest, res);
    expect(state.status).toBe(401);
  });
  it('rejects missing CSRF and invalid bodies before storage', async () => {
    getSession.mockResolvedValue({ id: 'synthetic-session', role: 'guest' });
    const { default: handler } = await import('../api/evaluate');
    validCsrf.mockReturnValueOnce(false);
    const denied = response(); await handler({ method: 'POST', headers: {} } as ApiRequest, denied.res);
    const invalid = response(); await handler({ method: 'POST', headers: {}, body: { requestId: 'wrong', answers: [] } } as ApiRequest, invalid.res);
    expect([denied.state.status, invalid.state.status]).toEqual([403, 400]); expect(recordsCollection).not.toHaveBeenCalled();
  });
  it('denies unauthorised administrator reads and clears', async () => {
    getSession.mockResolvedValue(null);
    const { default: records } = await import('../api/admin/records'); const { default: clear } = await import('../api/admin/clear');
    const read = response(); await records({ method: 'GET', headers: {} } as ApiRequest, read.res);
    const deletion = response(); await clear({ method: 'POST', headers: {}, body: { confirmRunId: 'demo-run' } } as ApiRequest, deletion.res);
    expect([read.state.status, deletion.state.status]).toEqual([401, 401]); expect(recordsCollection).not.toHaveBeenCalled();
  });
  it('requires administrator CSRF and exact run confirmation before deletion', async () => {
    getSession.mockResolvedValue({ id: 'admin', role: 'admin' }); const { default: clear } = await import('../api/admin/clear');
    validCsrf.mockReturnValueOnce(false);
    const csrf = response(); await clear({ method: 'POST', headers: {}, body: { confirmRunId: 'demo-run' } } as ApiRequest, csrf.res);
    const mismatch = response(); await clear({ method: 'POST', headers: {}, body: { confirmRunId: 'wrong' } } as ApiRequest, mismatch.res);
    expect([csrf.state.status, mismatch.state.status]).toEqual([403, 400]); expect(recordsCollection).not.toHaveBeenCalled();
  });
  it('returns safe JSON when the active run is unavailable', async () => {
    getSession.mockResolvedValue({ id: 'admin', role: 'admin' }); runId.mockImplementation(() => { throw new Error('configuration missing'); });
    const { default: clear } = await import('../api/admin/clear'); const { state, res } = response();
    await clear({ method: 'POST', headers: {}, body: { confirmRunId: 'demo-run' } } as ApiRequest, res);
    expect(state.status).toBe(503); expect(state.body).toEqual({ error: 'This service is unavailable right now. Please try again later.' });
  });
  it('deletes only after authorised exact confirmation', async () => {
    process.env['INTERVIEW_RUN_OPEN'] = 'false';
    getSession.mockResolvedValue({ id: 'admin', role: 'admin' });
    const deleted = vi.fn(); const commit = vi.fn();
    const get = vi.fn().mockResolvedValueOnce({ empty: false, size: 1, docs: [{ ref: 'synthetic-ref' }] }).mockResolvedValueOnce({ empty: true });
    recordsCollection.mockReturnValue({ limit: () => ({ get }), firestore: { batch: () => ({ delete: deleted, commit }) } });
    const { default: clear } = await import('../api/admin/clear'); const { state, res } = response();
    await clear({ method: 'POST', headers: {}, body: { confirmRunId: 'demo-run' } } as ApiRequest, res);
    expect(state.status).toBe(200); expect(state.body).toEqual({ deleted: 1 }); expect(deleted).toHaveBeenCalledWith('synthetic-ref'); expect(commit).toHaveBeenCalledOnce();
  });
  it('does not delete records from an open run', async () => {
    getSession.mockResolvedValue({ id: 'admin', role: 'admin' });
    const { default: clear } = await import('../api/admin/clear'); const { state, res } = response();
    await clear({ method: 'POST', headers: {}, body: { confirmRunId: 'demo-run' } } as ApiRequest, res);
    expect(state.status).toBe(409); expect(recordsCollection).not.toHaveBeenCalled();
  });
});
