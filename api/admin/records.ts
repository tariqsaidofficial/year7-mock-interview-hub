import { recordsCollection, runId } from '../../server/firebase-admin';
import { getSession } from '../../server/session';
import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  let session;
  try { session = await getSession(req, 'admin'); } catch { return safeError(res); }
  if (!session) return respond(res, 401, { error: 'Please sign in.' });
  try {
    const cursor = new URL(req.url || '/', 'https://local.invalid').searchParams.get('cursor');
    if (cursor && !/^[a-f0-9]{64}$/.test(cursor)) return respond(res, 400, { error: 'Invalid records page.' });
    const records = recordsCollection();
    let query = records.orderBy('createdAt', 'desc').limit(51);
    if (cursor) {
      const previous = await records.doc(cursor).get();
      if (!previous.exists) return respond(res, 400, { error: 'Records changed. Please refresh.' });
      query = query.startAfter(previous);
    }
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0, 50);
    const pendingCount = page.filter((doc) => doc.get('status') === 'processing' || doc.get('status') === 'failed').length;
    const completed = page.filter((doc) => doc.get('status') === 'complete').map((doc) => ({ id: doc.id, runId: doc.get('runId'), studentName: doc.get('studentName'), tutorGroup: doc.get('tutorGroup'), completedAt: doc.get('completedAt'), answers: doc.get('answers'), evaluation: doc.get('evaluation') }));
    return respond(res, 200, { runId: runId(), records: completed, pendingCount, nextCursor: snapshot.docs.length > 50 ? page.at(-1)?.id : null });
  } catch { return safeError(res); }
}
