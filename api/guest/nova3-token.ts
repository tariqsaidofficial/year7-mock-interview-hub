import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { db, runId } from '../../server/firebase-admin';
import { getSession, validCsrf } from '../../server/session';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    if (process.env['INTERVIEW_RUN_OPEN'] !== 'true') return respond(res, 403, { error: 'This classroom run is closed.' });
    const session = await getSession(req, 'guest');
    if (!session) return respond(res, 401, { error: 'Guest session expired. Please start again.' });
    if (!validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
    const key = process.env['DEEPGRAM_API_KEY'];
    if (!key) return respond(res, 503, { error: 'Speech comparison is not configured.' });

    // Transactions enforce limits across serverless instances. A failed grant still consumes a slot.
    const minute = Math.floor(Date.now() / 60_000);
    const counters = db().collection('interviewRuns').doc(runId()).collection('securityCounters');
    const sessionRef = counters.doc(`nova3-${minute}-${session.id}`);
    const totalRef = counters.doc(`nova3-total-${minute}`);
    const sessionRunRef = counters.doc(`nova3-run-${session.id}`);
    const totalRunRef = counters.doc('nova3-run-total');
    const allowed = await db().runTransaction(async (tx) => {
      const [own, all, ownRun, allRun] = await Promise.all([tx.get(sessionRef), tx.get(totalRef), tx.get(sessionRunRef), tx.get(totalRunRef)]);
      if (Number(own.get('count') || 0) >= 3 || Number(all.get('count') || 0) >= 60 || Number(ownRun.get('count') || 0) >= 12 || Number(allRun.get('count') || 0) >= 480) return false;
      const expiresAt = Date.now() + 3_600_000;
      tx.set(sessionRef, { count: Number(own.get('count') || 0) + 1, expiresAt });
      tx.set(totalRef, { count: Number(all.get('count') || 0) + 1, expiresAt });
      tx.set(sessionRunRef, { count: Number(ownRun.get('count') || 0) + 1 });
      tx.set(totalRunRef, { count: Number(allRun.get('count') || 0) + 1 });
      return true;
    });
    if (!allowed) return respond(res, 429, { error: 'Speech comparison limit reached. Please wait before trying again.' });

    const grant = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST', headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(5_000),
    });
    if (!grant.ok) return respond(res, 503, { error: 'Speech service is unavailable. Your answer is still here.' });
    const token = await grant.json() as { access_token?: string; expires_in?: number };
    if (typeof token.access_token !== 'string' || !/^[A-Za-z0-9._-]+$/.test(token.access_token) || token.expires_in !== 30) return safeError(res);
    return respond(res, 200, { accessToken: token.access_token, expiresIn: token.expires_in });
  } catch { return safeError(res); }
}
