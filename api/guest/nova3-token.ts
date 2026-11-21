import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { db, runId } from '../../server/firebase-admin';
import { getSession, validCsrf } from '../../server/session';
import { recordUsage, reserveSpeechGrant } from '../../server/usage';
import { previewDemoEnabled } from '../../server/preview-demo';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  if (previewDemoEnabled()) return respond(res, 403, { error: 'Microphone streaming is unavailable in the synthetic preview.' });
  try {
    const liveTrial = process.env['DEEPGRAM_LIVE_TRIAL'] === 'true';
    if (liveTrial && !process.env['FIRESTORE_EMULATOR_HOST']) return respond(res, 503, { error: 'The bounded speech trial requires the local Firestore emulator.' });
    if (process.env['INTERVIEW_RUN_OPEN'] !== 'true') return respond(res, 403, { error: 'This classroom run is closed.' });
    if (process.env['PAID_OPERATIONS_ENABLED'] === 'false') return respond(res, 503, { error: 'Speech service is paused by the school. You can type your answer.' });
    const session = await getSession(req, 'guest');
    if (!session) return respond(res, 401, { error: 'Guest session expired. Please start again.' });
    if (!validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
    const key = process.env['DEEPGRAM_API_KEY'];
    if (!key) return respond(res, 503, { error: 'Speech comparison is not configured.' });
    // Only the isolated emulator speech trial keeps its authorised two-grant cap.
    // Production has no cumulative run or per-guest grant ceiling.
    if (!await reserveSpeechGrant(session.id)) return respond(res, 429, { error: 'Too many microphone retries just now. Please wait a minute or type your answer.' });
    const counters = db().collection('interviewRuns').doc(runId()).collection('securityCounters');
    const trialRef = liveTrial ? counters.doc('nova3-live-trial-total') : null;
    if (trialRef) {
      const allowed = await db().runTransaction(async (tx) => {
        const trial = await tx.get(trialRef);
        const count = Number(trial.get('count') || 0);
        if (count >= 2) return false;
        tx.set(trialRef, { count: count + 1 });
        return true;
      });
      if (!allowed) return respond(res, 429, { error: 'The two-session local speech trial has finished.' });
    }

    let grant: Response;
    try {
      grant = await fetch('https://api.deepgram.com/v1/auth/grant', {
        method: 'POST', headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(5_000),
      });
    } catch {
      await recordUsage(session.id, { providerErrors: 1 });
      return respond(res, 503, { error: 'Speech service is unavailable. Your answer is still here.' });
    }
    if (!grant.ok) { await recordUsage(session.id, { providerErrors: 1 }); return respond(res, 503, { error: 'Speech service is unavailable. Your answer is still here.' }); }
    const token = await grant.json() as { access_token?: string; expires_in?: number };
    if (typeof token.access_token !== 'string' || !/^[A-Za-z0-9._-]+$/.test(token.access_token) || token.expires_in !== 30) { await recordUsage(session.id, { providerErrors: 1 }); return safeError(res); }
    await recordUsage(session.id, { tokenGrants: 1 });
    return respond(res, 200, { accessToken: token.access_token, expiresIn: token.expires_in });
  } catch { return safeError(res); }
}
