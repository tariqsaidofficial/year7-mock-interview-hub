import { recordsCollection, runId } from '../../server/firebase-admin';
import { getSession, validCsrf } from '../../server/session';
import { ApiRequest, ApiResponse, jsonBody, respond, safeError } from '../../server/http';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  let session;
  try { session = await getSession(req, 'admin'); } catch { return safeError(res); }
  if (!session) return respond(res, 401, { error: 'Please sign in.' });
  if (!validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
  let confirmation: unknown;
  try { confirmation = jsonBody(req); } catch { return respond(res, 400, { error: 'Confirmation is required.' }); }
  let activeRunId: string;
  try { activeRunId = runId(); } catch { return safeError(res); }
  if (!confirmation || typeof confirmation !== 'object' || (confirmation as Record<string, unknown>)['confirmRunId'] !== activeRunId) return respond(res, 400, { error: 'Confirmation does not match this session.' });
  if (process.env['INTERVIEW_RUN_OPEN'] === 'true') return respond(res, 409, { error: 'Close this classroom run before clearing its records.' });
  try {
    let deleted = 0;
    for (;;) {
      const batchSnapshot = await recordsCollection().limit(400).get();
      if (batchSnapshot.empty) break;
      const batch = recordsCollection().firestore.batch();
      batchSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit(); deleted += batchSnapshot.size;
    }
    return respond(res, 200, { deleted });
  } catch { return safeError(res); }
}
