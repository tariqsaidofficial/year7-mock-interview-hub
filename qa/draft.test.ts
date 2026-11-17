import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from '../src/app/draft';
import { QUESTIONS } from '../src/app/interview.models';
import { loadResult, saveResult } from '../src/app/result-store';
const data = new Map<string,string>();
vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
describe('local draft', () => {
  beforeEach(() => data.clear());
  it('retains exact answers and original start time after refresh', () => {
    const startedAt = Date.now() - 9 * 60_000;
    saveDraft({ version: 2, questionSetVersion: 2, id: crypto.randomUUID(), name: 'Example Student', group: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: q.id === 3 ? 'My exact answer.' : '' })), index: 3, startedAt, updatedAt: 0 });
    expect(loadDraft()?.answers[2].text).toBe('My exact answer.');
    expect(loadDraft()?.startedAt).toBe(startedAt);
    expect(loadDraft()?.questionSetVersion).toBe(2);
  });
  it('migrates an existing timed draft without losing answers', () => {
    const deadline = Date.now() - 60_000;
    data.set('year7-interview-draft-v1', JSON.stringify({ version: 1, id: crypto.randomUUID(), name: 'Example Student', group: '7A', answers: [{ questionId: 2, text: 'Preserved answer.' }], index: 1, deadline, updatedAt: Date.now() }));
    expect(loadDraft()?.answers[0].text).toBe('Preserved answer.');
    expect(loadDraft()?.startedAt).toBe(deadline - 480_000);
    expect(loadDraft()?.questionSetVersion).toBeUndefined();
  });
  it('expires after 24 hours and clears on demand', () => {
    saveDraft({ version: 2, id: crypto.randomUUID(), name: 'Example Student', group: '7A', answers: [], index: 0, startedAt: Date.now(), updatedAt: 0 });
    expect(loadDraft(Date.now() + 86_400_001)).toBeNull();
    expect(data.has('year7-interview-draft-v1')).toBe(false);
    clearDraft(); expect(loadDraft()).toBeNull();
  });
});

describe('temporary browser result retention', () => {
  it('keeps a completed V1 result with its original category IDs', () => {
    const entries = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) || null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); },
    });
    try {
      const categories = ['transition', 'subjects', 'activities', 'leadership'].map((categoryId) => ({ categoryId, indicator: 'Not enough evidence' as const, evidence: 'No answer.', nextStep: 'Try again.' }));
      saveResult('legacy', { categories, whatWentWell: [], evenBetterIf: 'Try again.', overallSummary: 'No feedback yet.', formattedCopyableText: 'Original feedback' });
      expect(loadResult('legacy')?.categories.map((item) => item.categoryId)).toEqual(['transition', 'subjects', 'activities', 'leadership']);
    } finally { vi.unstubAllGlobals(); }
  });
  it('removes an expired result when the same interview is revisited', () => {
    const entries = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) || null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); },
    });
    try {
      saveResult('synthetic-request', { categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: '', formattedCopyableText: '' });
      expect(loadResult('synthetic-request', Date.now() + 86_400_001)).toBeNull();
      expect(entries.has('year7-interview-result-v1')).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
