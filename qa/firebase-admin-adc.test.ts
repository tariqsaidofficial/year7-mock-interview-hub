import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const applicationDefault = vi.fn(() => ({ source: 'adc' }));
  const getApps = vi.fn(() => [] as { name: string; options: { projectId: string } }[]);
  const initializeApp = vi.fn((options: { projectId: string }, name: string) => ({ name, options }));
  const getFirestore = vi.fn(() => ({ source: 'named-firestore' }));
  return { applicationDefault, getApps, initializeApp, getFirestore };
});
vi.mock('firebase-admin/app', () => ({ applicationDefault: mocks.applicationDefault, getApps: mocks.getApps, initializeApp: mocks.initializeApp }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: mocks.getFirestore }));

describe('Firebase Admin keyless initialisation', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockClear());
    mocks.getApps.mockReturnValue([]);
    process.env['FIREBASE_PROJECT_ID'] = 'gen-lang-client-0286975933';
    process.env['FIRESTORE_DATABASE_ID'] = 'ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2';
    process.env['FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON'] = 'not-a-key-and-must-not-be-parsed';
  });
  afterEach(() => {
    delete process.env['FIREBASE_PROJECT_ID'];
    delete process.env['FIRESTORE_DATABASE_ID'];
    delete process.env['FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON'];
  });

  it('uses ADC and the explicit project with the existing named database, without a private key', async () => {
    const { db } = await import('../server/firebase-admin');
    expect(db()).toEqual({ source: 'named-firestore' });
    expect(mocks.applicationDefault).toHaveBeenCalledOnce();
    expect(mocks.initializeApp).toHaveBeenCalledWith(
      { credential: { source: 'adc' }, projectId: 'gen-lang-client-0286975933' },
      'year7-mock-interview',
    );
    expect(mocks.getFirestore).toHaveBeenCalledWith(
      mocks.initializeApp.mock.results[0].value,
      'ai-studio-year7mockintervi-517eee21-386a-46c2-8efc-58bdd46394a2',
    );
  });

  it('fails closed when the project ID is absent or an existing named app points elsewhere', async () => {
    const { db } = await import('../server/firebase-admin');
    delete process.env['FIREBASE_PROJECT_ID'];
    expect(() => db()).toThrow('Firebase project ID unavailable');
    process.env['FIREBASE_PROJECT_ID'] = 'gen-lang-client-0286975933';
    mocks.getApps.mockReturnValue([{ name: 'year7-mock-interview', options: { projectId: 'wrong-project' } }]);
    expect(() => db()).toThrow('Firebase project ID mismatch');
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });
});
