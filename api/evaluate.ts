import { createHash, randomUUID } from 'node:crypto';
import { recordsCollection, runId, db } from '../server/firebase-admin';
import { getSession, validCsrf } from '../server/session';
import { submissionSchema } from '../server/contract';
import { evaluate } from '../server/openrouter';
import { ApiRequest, ApiResponse, jsonBody, respond, safeError } from '../server/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  if (process.env['INTERVIEW_RUN_OPEN'] !== 'true') return respond(res, 403, { error: 'This classroom run is closed.' });
  let session;
  try { session = await getSession(req, 'guest'); } catch { return safeError(res); }
  if (!session) return respond(res, 401, { error: 'Guest session expired. Please ask your teacher for help.' });
  if (!validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
  let parsed: ReturnType<typeof submissionSchema.safeParse>;
  try {
    if (Number(req.headers['content-length'] || 0) > 16_000) return respond(res, 400, { error: 'The answers are too long to submit.' });
    const body = jsonBody(req);
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 16_000) return respond(res, 400, { error: 'The answers are too long to submit.' });
    parsed = submissionSchema.safeParse(body);
  }
  catch { return respond(res, 400, { error: 'Please check the interview answers.' }); }
  if (!parsed.success) return respond(res, 400, { error: 'Please check the interview answers.' });
  const submission = parsed.data;
  const fingerprint = createHash('sha256').update(JSON.stringify(submission)).digest('hex');
  const leaseId = randomUUID();
  try {
    const ref = recordsCollection().doc(session.id);
    const decision = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const prior = snap.data()!;
        if (prior['requestId'] !== submission.requestId || prior['fingerprint'] !== fingerprint) return { kind: 'mismatch' as const };
        if (prior['status'] === 'complete') return { kind: 'complete' as const, evaluation: prior['evaluation'] };
        if (prior['status'] === 'processing' && Date.now() - Number(prior['processingStartedAt'] || 0) < 120_000) return { kind: 'processing' as const };
        if ((prior['attempts'] || 0) >= 2) return { kind: 'limit' as const };
        tx.update(ref, { status: 'processing', processingStartedAt: Date.now(), leaseId, attempts: (prior['attempts'] || 0) + 1 });
        return { kind: 'new' as const };
      }
      tx.create(ref, { runId: runId(), ownerSessionId: session.id, requestId: submission.requestId, fingerprint, status: 'processing', processingStartedAt: Date.now(), leaseId, attempts: 1, studentName: submission.studentName, tutorGroup: submission.tutorGroup, answers: submission.answers, createdAt: new Date().toISOString() });
      return { kind: 'new' as const };
    });
    if (decision.kind === 'complete') return respond(res, 200, { evaluation: decision.evaluation });
    if (decision.kind === 'mismatch') return respond(res, 409, { error: 'An interview has already been submitted from this device for this session.' });
    if (decision.kind === 'processing') return respond(res, 409, { error: 'Your feedback is still being prepared. Please try again shortly.' });
    if (decision.kind === 'limit') return respond(res, 429, { error: 'The feedback service could not finish. Please ask your teacher for help.' });
    let evaluation;
    try { evaluation = await evaluate(submission.answers); }
    catch {
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.get('leaseId') === leaseId && snap.get('status') === 'processing') tx.update(ref, { status: 'failed' });
      });
      return respond(res, 503, { error: 'Feedback is unavailable right now. Please retry when online.' });
    }
    const final = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: 'missing' as const };
      if (snap.get('status') === 'complete') return { kind: 'complete' as const, evaluation: snap.get('evaluation') };
      if (snap.get('status') !== 'processing' || snap.get('leaseId') !== leaseId) return { kind: 'stale' as const };
      tx.update(ref, { status: 'complete', evaluation, completedAt: new Date().toISOString() });
      return { kind: 'complete' as const, evaluation };
    });
    if (final.kind === 'complete') return respond(res, 200, { evaluation: final.evaluation });
    return respond(res, 409, { error: 'Your feedback is still being prepared. Please try again shortly.' });
  } catch { return safeError(res); }
}
