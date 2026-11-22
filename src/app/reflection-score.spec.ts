import { describe, expect, it } from 'vitest';
import { Answer, QUESTIONS } from './interview.models';
import { DEMO_REFLECTION_ANSWERS, ReflectionScore, scoreReflectionAnswers } from './reflection-score';
const all = (text = ''): Answer[] => QUESTIONS.map(q => ({ questionId: q.id, text }));
const score = (answers: readonly Answer[]): ReflectionScore => {
  const result = scoreReflectionAnswers(answers);
  expect(result).not.toBe('unavailable');
  return result as ReflectionScore;
};
const one = (text: string, id = 1) => score(all().map(a => a.questionId === id ? { ...a, text } : a)).perQuestion[id - 1];
describe('answer development v1', () => {
  it('does not reward empty response placeholders', () => { expect(score(all('(No answer)')).total).toBe(0); });
  it('scores whitespace and blank answers zero', () => { expect(score(all(' \n ')).total).toBe(0); });
  it('scores deliberate complete fixtures 50, at most five each', () => {
    const result = score(all('During a lesson I made a colourful model with paper because it helps explain science. I learned to try different shapes.'));
    expect(result.total).toBe(50); expect(result.max).toBe(50);
    expect(result.perQuestion.every(q => q.score === 5)).toBe(true);
  });
  it('gives a one-word attempt only one point', () => { expect(one('Science').score).toBe(1); });
  it('does not reward repeated words or clauses', () => {
    expect(one('science '.repeat(50)).score).toBe(1);
    expect(one('I feel happy '.repeat(40)).score).toBe(one('I feel happy').score);
  });
  it('recognises concise EAL wording without grammar marks', () => {
    expect(one('I help team because all need turn. I feel happy.', 5).score).toBe(5);
  });
  it('separates explanation from an illustrative experience', () => {
    const q = one('I like science because testing different ideas helps explain interesting things.', 3);
    expect(q.reasons).toContain('Reason or elaboration'); expect(q.reasons).not.toContain('Experience or illustrative detail cue');
  });
  it('recognises an example without a magic example phrase', () => {
    expect(one('I helped our team share paint and paper to finish a poster.', 4).reasons).toContain('Experience or illustrative detail cue');
  });
  it('recognises a future-oriented Q10', () => { expect(one('In five years I hope to study science because I enjoy experiments and solving new problems.', 10).score).toBe(5); });
  it('does not count marker substrings inside unrelated words', () => {
    const q = one('The word becauseish appears beside duringness and next timeframe in my notebook.');
    expect(q.reasons).not.toContain('Reason or elaboration'); expect(q.reasons).not.toContain('Experience or illustrative detail cue'); expect(q.reasons).not.toContain('Reflection or next step cue');
  });
  it('does not score copied question text as developed answers', () => {
    expect(score(QUESTIONS.map(q => ({ questionId:q.id,text:q.text }))).total).toBe(0);
  });
  it('handles HTML-looking input as text, not executed content', () => { expect(one('<script>alert(1)</script>').score).toBe(1); });
  it('rejects missing, duplicate, unknown and malformed IDs/text', () => {
    for (const invalid of [all().slice(1), [...all().slice(1),all()[1]], [...all().slice(1),{questionId:11,text:'x'}], null, [{questionId:1,text:null}]]) {
      expect(scoreReflectionAnswers(invalid as Answer[])).toBe('unavailable');
    }
  });
  it('is deterministic and independent of answer ordering', () => {
    const a=score(DEMO_REFLECTION_ANSWERS); const b=score([...DEMO_REFLECTION_ANSWERS].reverse());
    expect(a).toEqual(b); expect(a.total).toBe(a.perQuestion.reduce((s,q)=>s+q.score,0)); expect(a.version).toBe('answer-development-v1');
  });
});
