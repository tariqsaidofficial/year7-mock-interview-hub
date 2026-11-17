import { CATEGORIES, LEGACY_CATEGORIES, Evaluation, RUBRIC_VERSION } from './interview.models';

const KEY = 'year7-interview-result-v1';
const DAY = 86_400_000;

export function saveResult(id: string, evaluation: Evaluation): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id, savedAt: Date.now(), evaluation }));
    return true;
  } catch { return false; }
}

export function loadResult(id: string, now = Date.now()): Evaluation | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) || 'null') as { id?: unknown; savedAt?: unknown; evaluation?: unknown } | null;
    if (!data || data.id !== id || typeof data.savedAt !== 'number' || now - data.savedAt > DAY || data.savedAt > now + 60_000) { clearResult(); return null; }
    const value = data.evaluation as Evaluation;
    const categories: readonly { id: string }[] = value?.rubricVersion === RUBRIC_VERSION ? CATEGORIES : LEGACY_CATEGORIES;
    if (!value || !Array.isArray(value.categories) || value.categories.length !== 4 ||
        value.categories.some((item, index) => item?.categoryId !== categories[index].id || !['Strong evidence', 'Some evidence', 'Not enough evidence'].includes(item.indicator) || typeof item.evidence !== 'string' || typeof item.nextStep !== 'string') ||
        !Array.isArray(value.whatWentWell) || value.whatWentWell.length > 2 || value.whatWentWell.some((item) => typeof item !== 'string') ||
        typeof value.evenBetterIf !== 'string' || typeof value.overallSummary !== 'string' || typeof value.formattedCopyableText !== 'string') { clearResult(); return null; }
    return value;
  } catch { clearResult(); return null; }
}

export function clearResult() {
  try { sessionStorage.removeItem(KEY); }
  catch { /* Browser storage unavailable. */ }
}
