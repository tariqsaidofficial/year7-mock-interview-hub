import { recordsCollection, runId } from '../../server/firebase-admin';
import { getSession } from '../../server/session';
import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  let session;
  try { session = await getSession(req, 'admin'); } catch { return safeError(res); }
  if (!session) return respond(res, 401, { error: 'Please sign in.' });
  try {
    const snapshot = await recordsCollection().orderBy('createdAt', 'desc').limit(100).get();
    const pendingCount = snapshot.docs.filter((doc) => doc.get('status') === 'processing' || doc.get('status') === 'failed').length;
    const records = snapshot.docs.filter((doc) => doc.get('status') === 'complete').map((doc) => ({ id: doc.id, runId: doc.get('runId'), studentName: doc.get('studentName'), tutorGroup: doc.get('tutorGroup'), completedAt: doc.get('completedAt'), answers: doc.get('answers'), evaluation: doc.get('evaluation') }));
    return respond(res, 200, { runId: runId(), records, pendingCount });
  } catch { return safeError(res); }
}
