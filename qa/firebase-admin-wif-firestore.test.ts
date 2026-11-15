import { afterAll, beforeAll, expect, it } from 'vitest';
import { deleteApp, getApps } from 'firebase-admin/app';

const keys = [
  'FIREBASE_PROJECT_ID', 'FIRESTORE_DATABASE_ID', 'GCP_PROJECT_NUMBER',
  'GCP_PROJECT_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
];
const previous = new Map(keys.map((key) => [key, process.env[key]]));

beforeAll(() => {
  process.env['FIREBASE_PROJECT_ID'] = 'gen-lang-client-0286975933';
  process.env['FIRESTORE_DATABASE_ID'] = 'ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2';
  process.env['GCP_PROJECT_NUMBER'] = '954616011030';
  process.env['GCP_PROJECT_ID'] = 'gen-lang-client-0286975933';
  process.env['GCP_WORKLOAD_IDENTITY_POOL_ID'] = 'vercel-year7';
  process.env['GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'] = 'vercel-dxbmark';
  process.env['GCP_SERVICE_ACCOUNT_EMAIL'] = 'year7-vercel@gen-lang-client-0286975933.iam.gserviceaccount.com';
});
afterAll(async () => {
  for (const key of keys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const app = getApps().find((candidate) => candidate.name === 'year7-mock-interview');
  if (app) await deleteApp(app);
});

it('the actual Firebase Admin Firestore client accepts the hosted GoogleAuth adapter without requesting a token', async () => {
  const { db } = await import('../server/firebase-admin');
  const instance = db();
  expect(instance.databaseId).toBe(process.env['FIRESTORE_DATABASE_ID']);
  const settings = instance as unknown as { _settings: { auth?: { constructor: { name: string } } } };
  expect(settings._settings.auth?.constructor.name).toBe('GoogleAuth');
});
