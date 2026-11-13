import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Firestore client rules (local emulator only)', () => {
  it('rejects anonymous record and PIN access', async () => {
    if (!process.env['FIRESTORE_EMULATOR_HOST']) throw new Error('Set FIRESTORE_EMULATOR_HOST; never run this against production');
    const env = await initializeTestEnvironment({
      projectId: 'demo-year7-rules',
      firestore: {
        host: '127.0.0.1', port: 8085,
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
    try {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(db.collection('interviewRecords').get());
      await assertFails(db.collection('interviewRecords').doc('test').set({ studentName: 'Test' }));
      await assertFails(db.collection('schoolSettings').doc('config').get());
      await assertFails(db.collection('schoolSettings').doc('config').set({ adminPin: '123456' }));
      const student = env.authenticatedContext('student-1').firestore();
      await assertFails(student.collection('interviewRuns').doc('test').collection('records').doc('student-2').get());
      await assertFails(student.collection('interviewRuns').doc('test').collection('records').doc('student-1').set({ status: 'complete' }));
      const teacher = env.authenticatedContext('teacher-1', { email: 'teacher@example.edu' }).firestore();
      await assertFails(teacher.collection('interviewRuns').doc('test').collection('records').get());
      await assertFails(teacher.collection('interviewRuns').doc('test').collection('records').doc('student-1').delete());
      expect(true).toBe(true);
    } finally {
      await env.cleanup();
    }
  });
});
