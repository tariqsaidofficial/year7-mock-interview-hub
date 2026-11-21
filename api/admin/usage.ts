import { previewDemoEnabled } from '../../server/preview-demo';
import { AggregateField } from 'firebase-admin/firestore';
import { db, runId } from '../../server/firebase-admin';
import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { getSession } from '../../server/session';

// Aggregate queries read distributed per-session documents. Estimates must be
// checked against provider dashboards; browser audio telemetry can be missed.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (previewDemoEnabled()) return respond(res, 403, { error: 'This endpoint is unavailable in the synthetic preview.' });
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  try {
    if (!await getSession(req, 'admin')) return respond(res, 401, { error: 'Please sign in.' });
    const usage = db().collection('interviewRuns').doc(runId()).collection('usage');
    // A multi-field SUM excludes documents missing any selected field. Speech-
    // only and typing-only sessions are sparse, so aggregate each field alone.
    const fields = ['audioSeconds', 'tokenGrants', 'completedEvaluations', 'providerErrors', 'promptTokens', 'completionTokens'] as const;
    const totals = await Promise.all(fields.map(async (field) => {
      const snap = await usage.aggregate({ total: AggregateField.sum(field) }).get();
      return Number(snap.data().total || 0);
    }));
    const data = Object.fromEntries(fields.map((field, index) => [field, totals[index]])) as Record<(typeof fields)[number], number>;
    const audioSeconds = Number(data.audioSeconds || 0);
    const promptTokens = Number(data.promptTokens || 0);
    const completionTokens = Number(data.completionTokens || 0);
    return respond(res, 200, { runId: runId(), usage: { audioSeconds, tokenGrants: Number(data.tokenGrants || 0),
      completedEvaluations: Number(data.completedEvaluations || 0), providerErrors: Number(data.providerErrors || 0), promptTokens, completionTokens },
      estimatedUsd: { deepgram: audioSeconds / 60 * 0.0077, openrouter: promptTokens / 1_000_000 * 0.10 + completionTokens / 1_000_000 * 0.50 },
      note: 'Estimates only. Check Deepgram and OpenRouter dashboards for billed usage and remaining credit.' });
  } catch { return safeError(res); }
}
