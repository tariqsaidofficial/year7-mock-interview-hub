import { FieldValue } from 'firebase-admin/firestore';
import { db, runId } from './firebase-admin';

export function usageRef(sessionId: string) {
  return db().collection('interviewRuns').doc(runId()).collection('usage').doc(sessionId);
}

// This short window limits a compromised guest cookie without imposing a run,
// classroom, shared-IP or lifetime ceiling on legitimate pupils.
export async function reserveSpeechGrant(sessionId: string): Promise<boolean> {
  const ref = usageRef(sessionId);
  const minute = Math.floor(Date.now() / 60_000);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.get('grantMinute') === minute ? Number(snap.get('grantsThisMinute') || 0) : 0;
    if (count >= 20) return false;
    tx.set(ref, { grantMinute: minute, grantsThisMinute: count + 1, updatedAt: Date.now() }, { merge: true });
    return true;
  });
}

export async function recordUsage(sessionId: string, fields: Record<string, number>): Promise<void> {
  const increments = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, FieldValue.increment(value)]));
  await usageRef(sessionId).set({ ...increments, updatedAt: Date.now() }, { merge: true });
}
