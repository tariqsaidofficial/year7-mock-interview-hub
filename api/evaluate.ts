import { createHash, randomUUID } from 'node:crypto';
import { recordsCollection, runId, db } from '../server/firebase-admin';
import { getSession, validCsrf } from '../server/session';
import { submissionSchema } from '../server/contract';
import { evaluate } from '../server/openrouter';
import { ApiRequest, ApiResponse, jsonBody, respond, safeError } from '../server/http';
import { FieldValue } from 'firebase-admin/firestore';
import { usageRef } from '../server/usage';
import { RUBRIC_VERSION } from '../src/app/interview.models';
import { previewDemoEnabled, syntheticEvaluation } from '../server/preview-demo';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  if (previewDemoEnabled()) {
    let body: unknown;
    if (Number(req.headers['content-length'] || 0) > 32) return respond(res, 400, { error: 'Synthetic demo requests only.' });
    try { body = jsonBody(req); } catch { return respond(res, 400, { error: 'Synthetic demo requests only.' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { demo?: unknown }).demo !== true || Buffer.byteLength(JSON.stringify(body), 'utf8') > 32) return respond(res, 400, { error: 'Synthetic demo requests only.' });
    return respond(res, 200, { evaluation: syntheticEvaluation(), demo: true });
  }
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
        if (prior['rubricVersion'] !== RUBRIC_VERSION) return { kind: 'legacy' as const };
        if (process.env['PAID_OPERATIONS_ENABLED'] === 'false') return { kind: 'paused' as const };
        if (prior['status'] === 'processing' && Date.now() - Number(prior['processingStartedAt'] || 0) < 120_000) return { kind: 'processing' as const };
        if ((prior['attempts'] || 0) >= 2) return { kind: 'limit' as const };
        tx.update(ref, { status: 'processing', processingStartedAt: Date.now(), leaseId, attempts: (prior['attempts'] || 0) + 1 });
        return { kind: 'new' as const };
      }
      if (process.env['PAID_OPERATIONS_ENABLED'] === 'false') return { kind: 'paused' as const };
      tx.create(ref, { runId: runId(), ownerSessionId: session.id, requestId: submission.requestId, fingerprint, rubricVersion: RUBRIC_VERSION, status: 'processing', processingStartedAt: Date.now(), leaseId, attempts: 1, studentName: submission.studentName, tutorGroup: submission.tutorGroup, answers: submission.answers, createdAt: new Date().toISOString() });
      return { kind: 'new' as const };
    });
    if (decision.kind === 'complete') return respond(res, 200, { evaluation: decision.evaluation });
    if (decision.kind === 'mismatch') return respond(res, 409, { error: 'An interview has already been submitted from this device for this session.' });
    if (decision.kind === 'legacy') return respond(res, 409, { error: 'These answers belong to an earlier question set. Please ask your teacher for help; your draft remains on this device.' });
    if (decision.kind === 'processing') return respond(res, 409, { error: 'Your feedback is still being prepared. Please try again shortly.' });
    if (decision.kind === 'limit') return respond(res, 429, { error: 'The feedback service could not finish. Please ask your teacher for help.' });
    if (decision.kind === 'paused') return respond(res, 503, { error: 'Feedback is paused by the school. Your answers remain on this device for retry.' });
    let evaluation;
    let modelUsage = { promptTokens: 0, completionTokens: 0 };
    let providerErrors = 0;
    try { evaluation = { ...await evaluate(submission.answers, (usage) => { modelUsage = usage; }, () => { providerErrors++; }), rubricVersion: RUBRIC_VERSION }; }
    catch {
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.get('leaseId') === leaseId && snap.get('status') === 'processing') {
          tx.update(ref, { status: 'failed' });
          tx.set(usageRef(session.id), { providerErrors: FieldValue.increment(Math.max(1, providerErrors)), updatedAt: Date.now() }, { merge: true });
        }
      });
      return respond(res, 503, { error: 'Feedback is unavailable right now. Please retry when online.' });
    }
    const final = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: 'missing' as const };
      if (snap.get('status') === 'complete') return { kind: 'complete' as const, evaluation: snap.get('evaluation') };
      if (snap.get('status') !== 'processing' || snap.get('leaseId') !== leaseId) return { kind: 'stale' as const };
      tx.update(ref, { status: 'complete', evaluation, completedAt: new Date().toISOString() });
      tx.set(usageRef(session.id), { completedEvaluations: FieldValue.increment(1), providerErrors: FieldValue.increment(providerErrors), promptTokens: FieldValue.increment(modelUsage.promptTokens), completionTokens: FieldValue.increment(modelUsage.completionTokens), updatedAt: Date.now() }, { merge: true });
      return { kind: 'complete' as const, evaluation };
    });
    if (final.kind === 'complete') return respond(res, 200, { evaluation: final.evaluation });
    return respond(res, 409, { error: 'Your feedback is still being prepared. Please try again shortly.' });
  } catch { return safeError(res); }
}
