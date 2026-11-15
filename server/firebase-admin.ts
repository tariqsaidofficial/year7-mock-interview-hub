import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ExternalAccountClient, GoogleAuth } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
let app: ReturnType<typeof initializeApp> | undefined;
let firestore: ReturnType<typeof getFirestore> | undefined;
let firestoreDatabaseId: string | undefined;
const APP_NAME = 'year7-mock-interview';

function hostedAuth(projectId: string): GoogleAuth | undefined {
  const fields = [
    process.env['GCP_PROJECT_NUMBER'],
    process.env['GCP_WORKLOAD_IDENTITY_POOL_ID'],
    process.env['GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'],
    process.env['GCP_SERVICE_ACCOUNT_EMAIL'],
  ];
  // A project number alone is shared with other server integrations. The
  // federation-specific variables switch this Firestore client to WIF.
  if (fields.slice(1).every((field) => !field)) return undefined;
  if (fields.some((field) => !field)) throw new Error('Google workload identity configuration incomplete');
  if (process.env['GCP_PROJECT_ID'] && process.env['GCP_PROJECT_ID'] !== projectId) {
    throw new Error('Google workload identity project ID mismatch');
  }
  const [projectNumber, poolId, providerId, serviceAccountEmail] = fields as string[];
  if (!/^\d{6,20}$/.test(projectNumber) ||
      !/^[a-z][a-z0-9-]{3,31}$/.test(poolId) ||
      !/^[a-z][a-z0-9-]{3,31}$/.test(providerId) ||
      !/^[a-z][a-z0-9-]*@[a-z][a-z0-9-]*\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail) ||
      !serviceAccountEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`)) {
    throw new Error('Google workload identity configuration invalid');
  }
  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    scopes: ['https://www.googleapis.com/auth/datastore'],
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!authClient) throw new Error('Google workload identity client unavailable');
  return new GoogleAuth({ authClient, projectId, scopes: ['https://www.googleapis.com/auth/datastore'] });
}
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
  if (firestore) {
    adminApp();
    if (firestoreDatabaseId !== databaseId) throw new Error('Firestore database ID changed after initialization');
    return firestore;
  }
  const firebaseApp = adminApp();
  const auth = hostedAuth(firebaseApp.options.projectId!);
  const instance = getFirestore(firebaseApp, databaseId);
  if (auth) {
    // Firestore forwards its settings to google-gax, which accepts GoogleAuth.
    // Firebase Admin itself still owns the named Firestore client and all operations.
    instance.settings({ auth } as unknown as Parameters<typeof instance.settings>[0]);
  }
  firestore = instance;
  firestoreDatabaseId = databaseId;
  return instance;
}
export function runId(): string {
  const id = process.env['INTERVIEW_RUN_ID'] || '';
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(id)) throw new Error('Interview run ID unavailable');
  return id;
}
export function recordsCollection() { return db().collection('interviewRuns').doc(runId()).collection('records'); }
