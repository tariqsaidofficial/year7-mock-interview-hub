import { Answer, QUESTIONS } from './interview.models';

export interface Draft {
  version: 2;
  id: string;
  name: string;
  group: string;
  answers: Answer[];
  index: number;
  startedAt: number;
  updatedAt: number;
}

interface LegacyDraft extends Omit<Draft, 'version' | 'startedAt'> {
  version: 1;
  deadline: number;
}

const KEY = 'year7-interview-draft-v1';
const DAY = 86_400_000;
const RECOMMENDED_MS = 8 * 60_000;

export function loadDraft(now = Date.now()): Draft | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || typeof data !== 'object') return null;
    const draft = data as Draft | LegacyDraft;
    if (
      (draft.version !== 1 && draft.version !== 2) ||
      typeof draft.updatedAt !== 'number' ||
      now - draft.updatedAt > DAY || now < draft.updatedAt - 60_000 ||
      !Array.isArray(draft.answers) ||
      !Number.isInteger(draft.index) || draft.index < 0 || draft.index >= QUESTIONS.length ||
      typeof draft.id !== 'string' || typeof draft.name !== 'string' || typeof draft.group !== 'string' ||
      draft.answers.some((answer) => !QUESTIONS.some((question) => question.id === answer.questionId) || typeof answer.text !== 'string')
    ) { clearDraft(); return null; }
    const startedAt = draft.version === 1 ? draft.deadline - RECOMMENDED_MS : draft.startedAt;
    if (!Number.isFinite(startedAt) || startedAt > now + 60_000) { clearDraft(); return null; }
    return { version: 2, id: draft.id, name: draft.name, group: draft.group, answers: draft.answers, index: draft.index, startedAt, updatedAt: draft.updatedAt };
  } catch { return null; }
}

export function saveDraft(draft: Draft): boolean {
  try { localStorage.setItem(KEY, JSON.stringify({ ...draft, updatedAt: Date.now() })); return true; }
  catch { return false; }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY); }
  catch { /* Browser storage unavailable. */ }
}
