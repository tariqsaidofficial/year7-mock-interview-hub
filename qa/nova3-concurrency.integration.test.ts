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

  it('100 simultaneous synthetic guests can start behind one public IP', async () => {
    process.env['INTERVIEW_RUN_ID'] = `nova-guest-${nonce}`;
    const { issueGuest } = await import('../server/session');
    const start = performance.now();
    const outcomes = await Promise.allSettled(Array.from({ length: 100 }, async () => {
      const { res } = response();
      return issueGuest(request(), res);
    }));
    expect(outcomes.filter((item) => item.status === 'fulfilled' && item.value.kind === 'created')).toHaveLength(100);
    console.log(`synthetic emulator 100 concurrent guest starts: ${Math.round(performance.now() - start)} ms`);
  }, 180_000);

  it('400 same-IP guests receive 4,000 simulated question grants plus retries', async () => {
    process.env['INTERVIEW_RUN_ID'] = `nova-400-${nonce}`;
    const { issueGuest } = await import('../server/session');
    const { default: issueToken } = await import('../api/guest/nova3-token');
    const started = performance.now();
    const guests: {cookie: string; csrf: string}[] = [];
    for (let offset = 0; offset < 400; offset += 25) {
      const batch = await Promise.all(Array.from({ length: 25 }, async () => {
        const { state, res } = response(); const result = await issueGuest(request(), res);
        expect(result.kind).toBe('created');
        if (result.kind !== 'created') throw new Error('Guest creation failed');
        return { cookie: state.cookie?.split(';')[0] || '', csrf: result.csrf };
      }));
      guests.push(...batch);
    }
    expect(new Set(guests.map((item) => item.cookie)).size).toBe(400);
    let successes = 0;
    for (let question = 0; question < 10; question++) {
      for (let offset = 0; offset < 400; offset += 50) {
        const statuses = await Promise.all(guests.slice(offset, offset + 50).map(async ({ cookie, csrf }) => {
          const { state, res } = response(); await issueToken(request(cookie, csrf), res); return state.status;
        }));
        expect(statuses).toEqual(Array(statuses.length).fill(200));
        successes += statuses.length;
      }
    }
    expect(successes).toBe(4000);
    const retryStatuses = await Promise.all(guests.slice(0, 100).map(async ({ cookie, csrf }) => {
      const { state, res } = response(); await issueToken(request(cookie, csrf), res); return state.status;
    }));
    expect(retryStatuses).toEqual(Array(100).fill(200));
    expect(fetch).toHaveBeenCalledTimes(4100);
    const { db, runId } = await import('../server/firebase-admin');
    const usageCollection = db().collection('interviewRuns').doc(runId()).collection('usage');
    const usage = await usageCollection.get();
    expect(usage.size).toBe(400);
    expect(usage.docs.reduce((sum, doc) => sum + Number(doc.get('tokenGrants') || 0), 0)).toBe(4100);
    const { issueAdmin } = await import('../server/session');
    const { default: adminUsage } = await import('../api/admin/usage');
    const admin = response(); await issueAdmin(request(), admin.res);
    const metrics = response(); await adminUsage({ ...request(admin.state.cookie?.split(';')[0]), method: 'GET' }, metrics.res);
    expect(metrics.state.status).toBe(200);
    expect(metrics.state.body).toMatchObject({ usage: { tokenGrants: 4100 }, estimatedUsd: { deepgram: 0 } });
    const { recordsCollection } = await import('../server/firebase-admin');
    const records = recordsCollection(); const recordBatch = db().batch();
    for (let index = 0; index < 400; index++) recordBatch.create(records.doc(index.toString(16).padStart(64, '0')), {
      runId: runId(), status: 'complete', studentName: `Synthetic ${index}`, tutorGroup: `7${'ABCDEF'[index % 6]}`,
      createdAt: new Date(1_800_000_000_000 + index * 1000).toISOString(), completedAt: new Date(1_800_000_000_000 + index * 1000).toISOString(),
      answers: [{ questionId: 1, text: `Synthetic answer ${index}` }], evaluation: { formattedCopyableText: 'Synthetic feedback' },
    });
    await recordBatch.commit();
    const { default: adminRecords } = await import('../api/admin/records');
    const seenIds = new Set<string>(); let cursor: string | null = null; let pages = 0;
    do {
      const page = response(); await adminRecords({ ...request(admin.state.cookie?.split(';')[0]), method: 'GET', url: `/api/admin/records${cursor ? `?cursor=${cursor}` : ''}` }, page.res);
      expect(page.state.status).toBe(200);
      const body = page.state.body as { records: {id: string}[]; nextCursor: string | null };
      body.records.forEach((record) => seenIds.add(record.id)); cursor = body.nextCursor; pages++;
    } while (cursor);
    expect(pages).toBe(8); expect(seenIds.size).toBe(400);
    console.log(`synthetic emulator 400 guests + 4,100 mocked grants: ${Math.round(performance.now() - started)} ms`);
  }, 360_000);

  it('bounds a single compromised guest to 20 grants per minute without a lifetime cap', async () => {
    process.env['INTERVIEW_RUN_ID'] = `nova-minute-${nonce}`;
    const { issueGuest } = await import('../server/session');
    const { default: issueToken } = await import('../api/guest/nova3-token');
    const first = response(); const created = await issueGuest(request(), first.res);
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') throw new Error('Guest creation failed');
    const guest = request(first.state.cookie?.split(';')[0], created.csrf);
    const results = await Promise.all(Array.from({ length: 21 }, async () => {
      const { state, res } = response(); await issueToken(guest, res); return state.status;
    }));
    expect(results.sort()).toEqual([...Array(20).fill(200), 429]);
  }, 90_000);

  it('limits the isolated live-trial run to two temporary grants', async () => {
    process.env['INTERVIEW_RUN_ID'] = `nova-trial-${nonce}`;
    process.env['DEEPGRAM_LIVE_TRIAL'] = 'true';
    try {
      const { issueGuest } = await import('../server/session');
      const { default: issueToken } = await import('../api/guest/nova3-token');
      const guests = await Promise.all(Array.from({ length: 3 }, async () => {
        const { state, res } = response(); const result = await issueGuest(request(), res);
        expect(result.kind).toBe('created');
        if (result.kind !== 'created') throw new Error('Guest creation failed');
        return { cookie: state.cookie?.split(';')[0] || '', csrf: result.csrf };
      }));
      const statuses = await Promise.all(guests.map(async ({ cookie, csrf }) => {
        const { state, res } = response(); await issueToken(request(cookie, csrf), res); return state.status;
      }));
      expect(statuses.sort()).toEqual([200, 200, 429]);
    } finally { delete process.env['DEEPGRAM_LIVE_TRIAL']; }
  }, 90_000);
});
