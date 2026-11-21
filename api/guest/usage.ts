import { previewDemoEnabled } from '../../server/preview-demo';
import { FieldValue } from 'firebase-admin/firestore';
import { db, runId } from '../../server/firebase-admin';
import { ApiRequest, ApiResponse, jsonBody, respond, safeError } from '../../server/http';
import { getSession, validCsrf } from '../../server/session';
import { usageRef } from '../../server/usage';

// Browser telemetry is an estimate, never an authorisation or billing source.
// Event IDs make retries harmless; neither audio nor transcript text is accepted.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (previewDemoEnabled()) return respond(res, 403, { error: 'This endpoint is unavailable in the synthetic preview.' });
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const session = await getSession(req, 'guest');
    if (!session) return respond(res, 401, { error: 'Guest session expired.' });
    if (!validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
    if (Number(req.headers['content-length'] || 0) > 512) return respond(res, 400, { error: 'Invalid usage report.' });
    const body = jsonBody(req) as Record<string, unknown>;
    const raw = JSON.stringify(body);
    if (!raw || Buffer.byteLength(raw, 'utf8') > 512) return respond(res, 400, { error: 'Invalid usage report.' });
    if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !['eventId', 'audioSeconds', 'providerErrors'].includes(key))) return respond(res, 400, { error: 'Invalid usage report.' });
    const { eventId, audioSeconds, providerErrors } = body;
    if (typeof eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || typeof audioSeconds !== 'number' || !Number.isFinite(audioSeconds) || audioSeconds < 0 || audioSeconds > 900
      || typeof providerErrors !== 'number' || !Number.isInteger(providerErrors) || providerErrors < 0 || providerErrors > 10) return respond(res, 400, { error: 'Invalid usage report.' });
    const eventRef = db().collection('interviewRuns').doc(runId()).collection('usageEvents').doc(`${session.id}-${eventId}`);
    await db().runTransaction(async (tx) => {
      if ((await tx.get(eventRef)).exists) return;
      tx.create(eventRef, { sessionId: session.id, createdAt: Date.now() });
      tx.set(usageRef(session.id), { audioSeconds: FieldValue.increment(audioSeconds), providerErrors: FieldValue.increment(providerErrors), updatedAt: Date.now() }, { merge: true });
    });
    return respond(res, 200, { recorded: true });
  } catch { return safeError(res); }
}
