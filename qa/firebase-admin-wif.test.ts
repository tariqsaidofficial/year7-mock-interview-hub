import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app = { name: 'year7-mock-interview', options: { projectId: 'gen-lang-client-0286975933' } };
  return {
    app,
    applicationDefault: vi.fn(() => ({ source: 'adc' })),
    getApps: vi.fn(() => []),
    initializeApp: vi.fn(() => app),
    settings: vi.fn(),
    getFirestore: vi.fn(),
    fromJSON: vi.fn(() => ({ source: 'external-account' })),
    googleAuth: vi.fn(),
    getVercelOidcToken: vi.fn(async () => 'request-scoped-token'),
  };
});
vi.mock('firebase-admin/app', () => ({ applicationDefault: mocks.applicationDefault, getApps: mocks.getApps, initializeApp: mocks.initializeApp }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: mocks.getFirestore }));
vi.mock('google-auth-library', () => ({
  ExternalAccountClient: { fromJSON: mocks.fromJSON },
  GoogleAuth: class { constructor(options: unknown) { mocks.googleAuth(options); } },
}));
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: mocks.getVercelOidcToken }));

const keys = [
  'FIREBASE_PROJECT_ID', 'FIRESTORE_DATABASE_ID', 'GCP_PROJECT_NUMBER',
  'GCP_PROJECT_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
];
const previous = new Map(keys.map((key) => [key, process.env[key]]));

describe('hosted Firebase Admin Workload Identity Federation', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) if (typeof mock === 'function' && 'mockClear' in mock) mock.mockClear();
    mocks.getFirestore.mockReturnValue({ settings: mocks.settings });
    process.env['FIREBASE_PROJECT_ID'] = 'gen-lang-client-0286975933';
    process.env['FIRESTORE_DATABASE_ID'] = 'ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2';
    process.env['GCP_PROJECT_NUMBER'] = '954616011030';
    process.env['GCP_PROJECT_ID'] = 'gen-lang-client-0286975933';
    process.env['GCP_WORKLOAD_IDENTITY_POOL_ID'] = 'vercel-year7';
    process.env['GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'] = 'vercel-dxbmark';
    process.env['GCP_SERVICE_ACCOUNT_EMAIL'] = 'year7-vercel@gen-lang-client-0286975933.iam.gserviceaccount.com';
  });
  afterEach(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('wires a request-scoped token supplier into the named Firestore client without requesting a token at import', async () => {
    const { db } = await import('../server/firebase-admin');
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
    db();
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
    expect(mocks.fromJSON).toHaveBeenCalledWith(expect.objectContaining({
      audience: '//iam.googleapis.com/projects/954616011030/locations/global/workloadIdentityPools/vercel-year7/providers/vercel-dxbmark',
      token_url: 'https://sts.googleapis.com/v1/token',
      scopes: ['https://www.googleapis.com/auth/datastore'],
    }));
    const config = mocks.fromJSON.mock.calls[0][0] as { subject_token_supplier: { getSubjectToken: () => Promise<string> } };
    expect(await config.subject_token_supplier.getSubjectToken()).toBe('request-scoped-token');
    expect(mocks.getVercelOidcToken).toHaveBeenCalledOnce();
    expect(mocks.googleAuth).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'gen-lang-client-0286975933',
      scopes: ['https://www.googleapis.com/auth/datastore'],
    }));
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.getFirestore).toHaveBeenCalledWith(mocks.app, process.env['FIRESTORE_DATABASE_ID']);
  });

  it('fails closed on partial federation configuration', async () => {
    delete process.env['GCP_SERVICE_ACCOUNT_EMAIL'];
    const { db } = await import('../server/firebase-admin');
    expect(() => db()).toThrow('Google workload identity configuration incomplete');
    expect(mocks.getFirestore).not.toHaveBeenCalled();
  });

  it('preserves local ADC when only the existing GCP project number is present', async () => {
    delete process.env['GCP_SERVICE_ACCOUNT_EMAIL'];
    delete process.env['GCP_WORKLOAD_IDENTITY_POOL_ID'];
    delete process.env['GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'];
    const { db } = await import('../server/firebase-admin');
    db();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.fromJSON).not.toHaveBeenCalled();
  });

  it('fails closed when the GCP project does not match Firebase', async () => {
    process.env['GCP_PROJECT_ID'] = 'different-project';
    const { db } = await import('../server/firebase-admin');
    expect(() => db()).toThrow('Google workload identity project ID mismatch');
    expect(mocks.getFirestore).not.toHaveBeenCalled();
  });
});
