import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../server/http';

const enabled = !!process.env['FIRESTORE_EMULATOR_HOST'];
const suite = enabled ? describe : describe.skip;
const nonce = Math.random().toString(36).slice(2, 8);

suite('Nova-3 token issuance under synthetic classroom concurrency', () => {
  beforeAll(() => {
    process.env['FIREBASE_PROJECT_ID'] = 'demo-nova3-load';
    process.env['FIRESTORE_DATABASE_ID'] = '(default)';
    process.env['APP_ORIGIN'] = 'http://localhost:3000';
    process.env['SESSION_PEPPER'] = 'synthetic-local-emulator-pepper-32-characters';
    process.env['INTERVIEW_RUN_OPEN'] = 'true';
    process.env['MAX_GUEST_SESSIONS'] = '40';
    process.env['MAX_GUEST_SESSIONS_PER_IP'] = '40';
    process.env['DEEPGRAM_API_KEY'] = 'synthetic-never-used-outside-mock';
  });
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ access_token: 'synthetic.jwt.token', expires_in: 30 }), { status: 200 })))); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function response() {
    const state: { status?: number; body?: unknown; cookie?: string } = {};
    const res = {
      setHeader(name: string, value: string) { if (name === 'Set-Cookie') state.cookie = value; },
      status(code: number) { state.status = code; return this; },
      json(body: unknown) { state.body = body; },
    } as unknown as ApiResponse;
    return { state, res };
  }
  function request(cookie = '', csrf = ''): ApiRequest {
    return { method: 'POST', headers: { origin: 'http://localhost:3000', 'x-requested-with': 'Year7Interview', 'x-csrf-token': csrf, cookie }, socket: { remoteAddress: '192.0.2.1' } } as unknown as ApiRequest;
  }

  for (const count of [1, 5, 15, 30]) it(`${count} independent synthetic guests can receive tokens without an application 429`, async () => {
    expect(vi.isMockFunction(fetch)).toBe(true);
    process.env['INTERVIEW_RUN_ID'] = `nova-${count}-${nonce}`;
    const { issueGuest } = await import('../server/session');
    const { default: issueToken } = await import('../api/guest/nova3-token');
    const start = performance.now();
    const guests = [];
    for (let index = 0; index < count; index++) {
      const { state, res } = response();
      const result = await issueGuest(request(), res);
      expect(result.kind).toBe('created');
      if (result.kind !== 'created') throw new Error('Guest creation failed');
      guests.push({ csrf: result.csrf, cookie: state.cookie?.split(';')[0] || '' });
    }
    const issued = await Promise.all(guests.map(async ({ csrf, cookie }) => {
      const { state, res } = response();
      await issueToken(request(cookie, csrf), res);
      return state;
    }));
    expect(issued.map((item) => item.status)).toEqual(Array(count).fill(200));
    expect(new Set(guests.map((item) => item.cookie)).size).toBe(count);
    console.log(`synthetic emulator ${count} guests: ${Math.round(performance.now() - start)} ms for guest creation + token grants`);
  }, 90_000);

  it('30 simultaneous synthetic guests can start without a shared-counter lock failure', async () => {
    process.env['INTERVIEW_RUN_ID'] = `nova-guest-${nonce}`;
    const { issueGuest } = await import('../server/session');
    const start = performance.now();
    const outcomes = await Promise.allSettled(Array.from({ length: 30 }, async () => {
      const { res } = response();
      return issueGuest(request(), res);
    }));
    expect(outcomes.filter((item) => item.status === 'fulfilled' && item.value.kind === 'created')).toHaveLength(30);
    console.log(`synthetic emulator 30 concurrent guest starts: ${Math.round(performance.now() - start)} ms`);
  }, 90_000);

  it('bounds one guest to three grants in a minute and forty slots in the run', async () => {
    process.env['INTERVIEW_RUN_ID'] = `nova-limits-${nonce}`;
    const { issueGuest } = await import('../server/session');
    const { default: issueToken } = await import('../api/guest/nova3-token');
    const first = response();
    const created = await issueGuest(request(), first.res);
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') throw new Error('Guest creation failed');
    const guest = request(first.state.cookie?.split(';')[0], created.csrf);
    const grants = await Promise.all(Array.from({ length: 4 }, async () => {
      const { state, res } = response(); await issueToken(guest, res); return state.status;
    }));
    expect(grants.sort()).toEqual([200, 200, 200, 429]);
    const more = await Promise.allSettled(Array.from({ length: 40 }, async () => {
      const { res } = response(); return issueGuest(request(), res);
    }));
    expect(more.filter((item) => item.status === 'fulfilled' && item.value.kind === 'created')).toHaveLength(39);
    expect(more.filter((item) => item.status === 'fulfilled' && item.value.kind === 'limited')).toHaveLength(1);
  }, 90_000);
});
