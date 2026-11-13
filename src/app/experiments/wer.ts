export function words(text: string): string[] {
  return text.toLocaleLowerCase('en-GB').normalize('NFKC').replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);
}

export function wordErrorRate(reference: string, transcript: string): { errors: number; referenceWords: number; wer: number | null } {
  const expected = words(reference); const actual = words(transcript);
  if (!expected.length) return { errors: 0, referenceWords: 0, wer: null };
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i++) {
    const next = [i];
    for (let j = 1; j <= actual.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1));
    previous = next;
  }
  const errors = previous[actual.length];
  return { errors, referenceWords: expected.length, wer: errors / expected.length };
}
