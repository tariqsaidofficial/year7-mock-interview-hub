import { describe, expect, it } from 'vitest';
import { wordErrorRate } from './wer';
describe('adult speech comparison metric', () => {
  it('counts substitution, deletion and insertion against exact spoken reference', () => {
    expect(wordErrorRate('I used my planner', 'I use my planner').errors).toBe(1);
    expect(wordErrorRate('I used my planner', 'I used planner').errors).toBe(1);
    expect(wordErrorRate('I used my planner', 'I used my blue planner').errors).toBe(1);
  });
  it('does not penalise repetition when it is included in the exact spoken reference', () => {
    expect(wordErrorRate('I I used my planner', 'I I used my planner').wer).toBe(0);
    expect(wordErrorRate('', 'anything').wer).toBeNull();
  });
});
