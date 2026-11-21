import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../server/http';
import { previewDemoEnabled, syntheticEvaluation } from '../server/preview-demo';

const getSession = vi.fn();
const db = vi.fn();
const recordsCollection = vi.fn();
const evaluate = vi.fn();
vi.mock('../server/session', () => ({ getSession, issueCsrf: vi.fn(), issueGuest: vi.fn(), sameOrigin: vi.fn(), validCsrf: vi.fn(), allowAdminAttempt: vi.fn(), issueAdmin: vi.fn(), revokeSession: vi.fn(), verifyAdminPassword: vi.fn() }));
vi.mock('../server/firebase-admin', () => ({ db, recordsCollection, runId: vi.fn() }));
vi.mock('../server/openrouter', () => ({ evaluate }));
vi.mock('../server/usage', () => ({ usageRef: vi.fn(), recordUsage: vi.fn(), reserveSpeechGrant: vi.fn() }));

function response() {
  const state: { status?: number; body?: unknown } = {};
  const res = { setHeader: vi.fn(), status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; } } as unknown as ApiResponse;
  return { state, res };
}

describe('isolated synthetic Preview', () => {
  beforeEach(() => {
    process.env['VERCEL_ENV'] = 'preview';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'feat/privacy-ready-preview-2026-11-17';
    process.env['PREVIEW_DEMO_MODE'] = 'true';
    process.env['INTERVIEW_RUN_OPEN'] = 'false';
    getSession.mockClear(); db.mockClear(); recordsCollection.mockClear(); evaluate.mockClear();
  });
  afterEach(() => {
    for (const key of ['VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'PREVIEW_DEMO_MODE', 'INTERVIEW_RUN_OPEN']) delete process.env[key];
  });

  it('fails closed for Production, an unrelated branch, or a missing branch flag', () => {
    expect(previewDemoEnabled()).toBe(true);
    process.env['VERCEL_ENV'] = 'production'; expect(previewDemoEnabled()).toBe(false);
    process.env['VERCEL_ENV'] = 'preview'; process.env['VERCEL_GIT_COMMIT_REF'] = 'main'; expect(previewDemoEnabled()).toBe(false);
    process.env['VERCEL_GIT_COMMIT_REF'] = 'feat/privacy-ready-preview-2026-11-17'; delete process.env['PREVIEW_DEMO_MODE']; expect(previewDemoEnabled()).toBe(false);
  });

  it('opens only synthetic availability and produces fixed rubric-v2 feedback', async () => {
    const { default: availability } = await import('../api/guest/availability');
    const { default: submit } = await import('../api/evaluate');
    const a = response(); availability({ method: 'GET', headers: {} } as ApiRequest, a.res);
    expect(a.state.body).toEqual({ open: true, demo: true });
    const invalid = response(); await submit({ method: 'POST', headers: {}, body: { demo: true, studentName: 'Do not send' } } as ApiRequest, invalid.res);
    expect(invalid.state.status).toBe(400);
    const oversized = response(); await submit({ method: 'POST', headers: { 'content-length': '4000' }, body: { demo: true } } as ApiRequest, oversized.res);
    expect(oversized.state.status).toBe(400);
    const result = response(); await submit({ method: 'POST', headers: {}, body: { demo: true } } as ApiRequest, result.res);
    expect(result.state).toEqual({ status: 200, body: { evaluation: syntheticEvaluation(), demo: true } });
    expect(syntheticEvaluation().categories).toHaveLength(4);
    expect(getSession).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled(); expect(recordsCollection).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled();
  });

  it('denies guest sessions, paid tokens, telemetry and all teacher endpoints before storage access', async () => {
    const modules = await Promise.all([
      import('../api/guest/session'), import('../api/guest/nova3-token'), import('../api/guest/usage'),
      import('../api/admin/login'), import('../api/admin/logout'), import('../api/admin/session'),
      import('../api/admin/records'), import('../api/admin/clear'), import('../api/admin/usage'),
    ]);
    for (const module of modules) {
      const out = response();
      await module.default({ method: 'POST', headers: {} } as ApiRequest, out.res);
      expect(out.state.status).toBe(403);
    }
    expect(getSession).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled(); expect(recordsCollection).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled();
  });
});
