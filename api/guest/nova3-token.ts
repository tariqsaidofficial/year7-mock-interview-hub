import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { db, runId } from '../../server/firebase-admin';
import { getSession, validCsrf } from '../../server/session';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const liveTrial = process.env['DEEPGRAM_LIVE_TRIAL'] === 'true';
    if (liveTrial && !process.env['FIRESTORE_EMULATOR_HOST']) return respond(res, 503, { error: 'The bounded speech trial requires the local Firestore emulator.' });
    if (process.env['INTERVIEW_RUN_OPEN'] !== 'true') return respond(res, 403, { error: 'This classroom run is closed.' });
    const session = await getSession(req, 'guest');
    if (!session) return respond(res, 401, { error: 'Guest session expired. Please start again.' });
    if (!validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
    const key = process.env['DEEPGRAM_API_KEY'];
    if (!key) return respond(res, 503, { error: 'Speech comparison is not configured.' });
    const maxGuests = Number(process.env['MAX_GUEST_SESSIONS'] || 40);
    if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 40) return safeError(res);

    // Per-session transactions avoid a shared classroom counter lock. The guest
    // session ceiling bounds the run to at most 40 x 16 grants.
    const minute = Math.floor(Date.now() / 60_000);
    const counters = db().collection('interviewRuns').doc(runId()).collection('securityCounters');
    const sessionRef = counters.doc(`nova3-${minute}-${session.id}`);
    const sessionRunRef = counters.doc(`nova3-run-${session.id}`);
    const trialRef = liveTrial ? counters.doc('nova3-live-trial-total') : null;
    const allowed = await db().runTransaction(async (tx) => {
      const [own, ownRun, trial] = await Promise.all([tx.get(sessionRef), tx.get(sessionRunRef), trialRef ? tx.get(trialRef) : Promise.resolve(null)]);
      if (Number(own.get('count') || 0) >= 3 || Number(ownRun.get('count') || 0) >= 16 || (trial && Number(trial.get('count') || 0) >= 2)) return false;
      const expiresAt = Date.now() + 3_600_000;
      tx.set(sessionRef, { count: Number(own.get('count') || 0) + 1, expiresAt });
      tx.set(sessionRunRef, { count: Number(ownRun.get('count') || 0) + 1 });
      if (trialRef && trial) tx.set(trialRef, { count: Number(trial.get('count') || 0) + 1 });
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
