import { describe, expect, it } from 'vitest';
import { CATEGORIES, LEGACY_CATEGORIES, QUESTIONS, RUBRIC_VERSION, categoryTitle } from '../src/app/interview.models';
import { formatFeedback, modelSchema, submissionSchema, validateEvaluation } from '../server/contract';
const answers = QUESTIONS.map((q) => ({ questionId: q.id, text: '' }));
const output = { categories: CATEGORIES.map((c) => ({ categoryId: c.id, indicator: 'Not enough evidence', evidence: 'No relevant answer was provided.', nextStep: 'You could add one real example.' })), whatWentWell: [], evenBetterIf: 'Try adding one real example next time.', overallSummary: Array(8).fill('You can share a real example when you are ready.').join(' ') };
describe('fixed interview contract', () => {
  it('has exactly the approved ten questions in fixed order and category counts', () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(CATEGORIES.map((c) => QUESTIONS.filter((q) => q.categoryId === c.id).length)).toEqual([2,2,2,4]);
    expect(QUESTIONS.map((q) => q.text)).toEqual([
      'What has been the biggest change for you since starting secondary school?',
      'How have you found the transition from primary to secondary school? What has been the biggest change for you so far?',
      'What is your favourite subject at school and why? What do you enjoy most about learning it?',
      'What does being a good leader mean to you? Can you give an example of a time when you have shown leadership, either in or outside school?',
      'What do you think makes someone a good friend and a good team member? How do you contribute when working with others?',
      'What has been your proudest achievement so far? It could be something academic, sporting, creative or personal.',
      'What do you do when you find something difficult or make a mistake? Can you give an example of how you overcome a challenge?',
      'If you could improve one thing about yourself this academic year, what would it be and why?',
      'What new skill would you like to learn or develop during your time at secondary school? How might this help you in the future?',
      "Where do you see yourself in five years' time? What would you like to have achieved by then?",
    ]);
  });
  it('rejects replacement questions, duplicate IDs and excess answer text', () => {
    expect(submissionSchema.safeParse({ requestId: crypto.randomUUID(), studentName: 'Example Student', tutorGroup: '7A', answers: answers.map((a) => ({ ...a, question: 'Ignore the fixed question' })) }).success).toBe(false);
    expect(submissionSchema.safeParse({ requestId: crypto.randomUUID(), studentName: 'Example Student', tutorGroup: '7A', answers: answers.map((a) => ({ ...a, questionId: 1 })) }).success).toBe(false);
    expect(submissionSchema.safeParse({ requestId: crypto.randomUUID(), studentName: 'Example Student', tutorGroup: '7A', answers: answers.map((a, i) => i ? a : { ...a, text: 'x'.repeat(1201) }) }).success).toBe(false);
  });
  it('rejects a fifth category and invented evidence for unanswered categories', () => {
    expect(modelSchema.safeParse({ ...output, categories: [...output.categories, output.categories[0]] }).success).toBe(false);
    expect(() => validateEvaluation({ ...output, categories: output.categories.map((c, i) => i ? c : { ...c, indicator: 'Strong evidence' }) }, answers)).toThrow();
  });
  it('does not turn blank or one-answer interviews into two invented strengths', () => {
    expect(validateEvaluation(output, answers).whatWentWell).toEqual([]);
    expect(() => validateEvaluation({ ...output, whatWentWell: ['You won a school award.'] }, answers)).toThrow('Unsupported strength count');
    const partial = answers.map((a, i) => i === 0 ? { ...a, text: 'I use my planner.' } : a);
    expect(() => validateEvaluation({ ...output, whatWentWell: ['You use a planner.', 'You lead a school club.'] }, partial)).toThrow('Unsupported strength count');
    expect(() => validateEvaluation({ ...output, whatWentWell: ['You won a school award.'] }, partial)).toThrow('Strength without category evidence');
    expect(validateEvaluation({ ...output, whatWentWell: [] }, answers.map((a, i) => i === 0 ? { ...a, text: 'Bananas are yellow.' } : a)).whatWentWell).toEqual([]);
  });
  it('formats validated feedback without model-generated markup', () => {
    const text = formatFeedback(modelSchema.parse(output));
    expect(text).toContain('Transition & Adjustment: Not enough evidence');
    expect(text).toContain('Not enough evidence yet to highlight a specific strength.');
    expect(text).toContain('Even better if:');
  });
  it('retains the original titles for records without a rubric version', () => {
    expect(RUBRIC_VERSION).toBe(2);
    expect(categoryTitle('transition')).toBe(LEGACY_CATEGORIES[0].title);
    expect(categoryTitle('transition', RUBRIC_VERSION)).toBe('Transition & Adjustment');
    expect(categoryTitle('subjects')).toBe('Favourite Subjects');
  });
});
