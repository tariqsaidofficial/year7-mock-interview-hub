import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import type { ApiRequest, ApiResponse } from '../server/http';
const mocks = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    id: path.split('/').at(-1)!, path,
    get: async () => snapshot(path),
    create: async (value: Record<string, unknown>) => { if (documents.has(path)) throw new Error('exists'); documents.set(path, value); },
    update: async (value: Record<string, unknown>) => { documents.set(path, { ...documents.get(path), ...value }); },
    delete: async () => { documents.delete(path); },
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
  });
  const snapshot = (path: string) => ({ exists: documents.has(path), id: path.split('/').at(-1)!, data: () => documents.get(path), get: (field: string) => documents.get(path)?.[field] });
  const db = () => ({ collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }), batch: () => {
    const pending: { path: string; value: Record<string, unknown> }[] = [];
    return { create: (r: {path: string}, value: Record<string, unknown>) => { pending.push({ path: r.path, value }); }, commit: async () => {
      if (pending.some((item) => documents.has(item.path))) throw Object.assign(new Error('exists'), { code: 6 });
      for (const item of pending) documents.set(item.path, item.value);
    } };
  }, runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ get: async (r: {path: string}) => snapshot(r.path), set: (r: {path: string}, value: Record<string, unknown>) => { documents.set(r.path, value); } }) });
  return { documents, db };
});
vi.mock('../server/firebase-admin', () => ({ db: mocks.db, runId: () => 'demo-run' }));
import { allowAdminAttempt, getSession, issueCsrf, issueGuest, revokeSession, sameOrigin, validCsrf } from '../server/session';
function request(cookie = '', ip = '192.0.2.1', origin = 'https://class.example'): ApiRequest { return { headers: { cookie, origin }, socket: { remoteAddress: ip } } as ApiRequest; }
function response() { const headers = new Map<string, string>(); return { headers, res: { setHeader: (key: string, value: string) => headers.set(key, value) } as ApiResponse }; }
describe('server-side session security', () => {
  beforeEach(() => { mocks.documents.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T09:00:00Z')); process.env['SESSION_PEPPER'] = 'synthetic-secret-with-at-least-32-characters'; process.env['APP_ORIGIN'] = 'https://class.example'; process.env['INTERVIEW_RUN_OPEN'] = 'true'; delete process.env['VERCEL']; });
  afterEach(() => { vi.useRealTimers(); for (const key of ['SESSION_PEPPER', 'APP_ORIGIN', 'INTERVIEW_RUN_OPEN', 'ADMIN_PASSWORD_HASH']) delete process.env[key]; });
  it('issues a secure opaque cookie, expires it, and rejects a revoked cookie replay', async () => {
    const output = response(); const issued = await issueGuest(request(), output.res);
    expect(issued.kind).toBe('created');
    const setCookie = output.headers.get('Set-Cookie')!;
    expect(setCookie).toContain('HttpOnly; Secure; SameSite=Strict');
    const cookie = setCookie.split(';')[0];
    expect(await getSession(request(cookie), 'guest')).toMatchObject({ role: 'guest' });
    expect(await getSession(request(cookie, '192.0.2.9'), 'guest')).toBeNull();
    const csrf = await issueCsrf(request(cookie), 'guest');
    expect(validCsrf({ ...request(cookie), headers: { ...request(cookie).headers, 'x-csrf-token': csrf! } } as ApiRequest, (await getSession(request(cookie), 'guest'))!)).toBe(true);
    expect(validCsrf({ ...request(cookie, '192.0.2.1', 'https://evil.example'), headers: { ...request(cookie, '192.0.2.1', 'https://evil.example').headers, 'x-csrf-token': csrf! } } as ApiRequest, (await getSession(request(cookie), 'guest'))!)).toBe(false);
    await revokeSession(request(cookie), response().res, 'guest');
    expect(await getSession(request(cookie), 'guest')).toBeNull();
    const renewed = response(); await issueGuest(request(), renewed.res);
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
    expect(await getSession(request(renewed.headers.get('Set-Cookie')!.split(';')[0]), 'guest')).toBeNull();
  });
  it('reuses a valid guest cookie and closes the run to new sessions', async () => {
    const first = response(); expect((await issueGuest(request(), first.res)).kind).toBe('created');
    const cookie = first.headers.get('Set-Cookie')!.split(';')[0];
    expect((await issueGuest(request(cookie), response().res)).kind).toBe('existing');
    expect(mocks.documents.size).toBe(1);
    process.env['INTERVIEW_RUN_OPEN'] = 'false';
    expect((await issueGuest(request('', '192.0.2.3'), response().res)).kind).toBe('closed');
  });
  it('allows 400 independent guests behind one public address with no slot or IP counter', async () => {
    for (let i = 0; i < 400; i++) expect((await issueGuest(request(), response().res)).kind).toBe('created');
    expect(mocks.documents.size).toBe(400);
    expect([...mocks.documents.keys()].every((key) => key.includes('/sessions/'))).toBe(true);
  });
  it('limits administrator attempts per address and rejects wrong origin', async () => {
    for (let i = 0; i < 5; i++) expect(await allowAdminAttempt(request())).toBe(true);
    expect(await allowAdminAttempt(request())).toBe(false);
    expect(sameOrigin(request('', '192.0.2.1', 'https://evil.example'))).toBe(false);
  });
  it('limits login failures and revokes an administrator cookie on logout', async () => {
    const salt = randomBytes(16); const password = 'synthetic-long-school-password';
    process.env['ADMIN_PASSWORD_HASH'] = `scrypt$32768$8$3$${salt.toString('hex')}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
    const { default: login } = await import('../api/admin/login');
    const { default: logout } = await import('../api/admin/logout');
    const apiResponse = () => { const output = response(); const state: { status?: number; body?: unknown } = {}; return { ...output, state, res: { ...output.res, status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; } } as ApiResponse }; };
    const loginRequest = (value: string, ip = '192.0.2.1') => ({ ...request('', ip), method: 'POST', headers: { ...request('', ip).headers, 'x-requested-with': 'Year7Interview' }, body: { password: value } } as ApiRequest);
    for (let i = 0; i < 5; i++) { const result = apiResponse(); await login(loginRequest('wrong'), result.res); expect(result.state.status).toBe(401); }
    const limited = apiResponse(); await login(loginRequest(password), limited.res); expect(limited.state.status).toBe(429);
    const allowed = apiResponse(); await login(loginRequest(password, '192.0.2.2'), allowed.res); expect(allowed.state.status).toBe(200);
    const cookie = allowed.headers.get('Set-Cookie')!.split(';')[0];
    expect(await getSession(request(cookie, '192.0.2.2'), 'admin')).toMatchObject({ role: 'admin' });
    const csrf = await issueCsrf(request(cookie, '192.0.2.2'), 'admin');
    const logoutRequest = { ...request(cookie, '192.0.2.2'), method: 'POST', headers: { ...request(cookie, '192.0.2.2').headers, 'x-csrf-token': csrf! } } as ApiRequest;
    const signedOut = apiResponse(); await logout(logoutRequest, signedOut.res); expect(signedOut.state.status).toBe(200);
    expect(await getSession(request(cookie, '192.0.2.2'), 'admin')).toBeNull();
    const another = apiResponse(); await login(loginRequest(password, '192.0.2.3'), another.res);
    const anotherCookie = another.headers.get('Set-Cookie')!.split(';')[0];
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    expect(await getSession(request(anotherCookie, '192.0.2.3'), 'admin')).toBeNull();
  });
});
