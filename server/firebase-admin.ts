import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
let app: ReturnType<typeof initializeApp> | undefined;
const APP_NAME = 'year7-mock-interview';
function adminApp() {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  if (!projectId) throw new Error('Firebase project ID unavailable');
  if (app && app.options.projectId !== projectId) throw new Error('Firebase project ID changed after initialization');
  if (app) return app;
  const existing = getApps().find((candidate) => candidate.name === APP_NAME);
  if (existing && existing.options.projectId !== projectId) throw new Error('Firebase project ID mismatch');
  app = existing || initializeApp({ credential: applicationDefault(), projectId }, APP_NAME);
  return app;
}
export function db() {
  const databaseId = process.env['FIRESTORE_DATABASE_ID'];
  if (!databaseId) throw new Error('Firestore database ID unavailable');
  return getFirestore(adminApp(), databaseId);
}
export function runId(): string {
  const id = process.env['INTERVIEW_RUN_ID'] || '';
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(id)) throw new Error('Interview run ID unavailable');
  return id;
}
export function recordsCollection() { return db().collection('interviewRuns').doc(runId()).collection('records'); }
