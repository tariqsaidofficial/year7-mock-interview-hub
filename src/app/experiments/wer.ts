export function words(text: string): string[] {
  return text.toLocaleLowerCase('en-GB').normalize('NFKC').replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);
}

export function wordErrorRate(reference: string, transcript: string): { errors: number; substitutions: number; deletions: number; insertions: number; referenceWords: number; wer: number | null } {
  const expected = words(reference); const actual = words(transcript);
  if (!expected.length) return { errors: 0, substitutions: 0, deletions: 0, insertions: 0, referenceWords: 0, wer: null };
  interface Count { substitutions: number; deletions: number; insertions: number }
  const cost = (value: Count) => value.substitutions + value.deletions + value.insertions;
  let previous: Count[] = Array.from({ length: actual.length + 1 }, (_, index) => ({ substitutions: 0, deletions: 0, insertions: index }));
  for (let i = 1; i <= expected.length; i++) {
    const next: Count[] = [{ substitutions: 0, deletions: i, insertions: 0 }];
    for (let j = 1; j <= actual.length; j++) {
      const same = expected[i - 1] === actual[j - 1];
      const diagonal = { ...previous[j - 1], substitutions: previous[j - 1].substitutions + (same ? 0 : 1) };
      const deletion = { ...previous[j], deletions: previous[j].deletions + 1 };
      const insertion = { ...next[j - 1], insertions: next[j - 1].insertions + 1 };
      next[j] = [diagonal, deletion, insertion].reduce((best, candidate) => cost(candidate) < cost(best) ? candidate : best);
    }
    previous = next;
  }
  const result = previous[actual.length]; const errors = cost(result);
  return { errors, ...result, referenceWords: expected.length, wer: errors / expected.length };
}
