import { describe, expect, it } from 'vitest';
import { CATEGORIES, QUESTIONS } from '../src/app/interview.models';
import { formatFeedback, modelSchema, submissionSchema, validateEvaluation } from '../server/contract';
const answers = QUESTIONS.map((q) => ({ questionId: q.id, text: '' }));
const output = { categories: CATEGORIES.map((c) => ({ categoryId: c.id, indicator: 'Not enough evidence', evidence: 'No relevant answer was provided.', nextStep: 'You could add one real example.' })), whatWentWell: [], evenBetterIf: 'Try adding one real example next time.', overallSummary: Array(8).fill('You can share a real example when you are ready.').join(' ') };
describe('fixed interview contract', () => {
  it('has exactly the approved ten questions in fixed order and category counts', () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(CATEGORIES.map((c) => QUESTIONS.filter((q) => q.categoryId === c.id).length)).toEqual([3,2,2,3]);
    expect(QUESTIONS.map((q) => q.text)).toEqual([
      'What has been the biggest change for you since starting secondary school?',
      'What helps you stay organised during the school day?',
      'Tell me about something that felt difficult at first. What helped you manage it?',
      'Which school subject do you enjoy most, and why?',
      'Can you describe a lesson, activity or piece of work in that subject that you enjoyed or felt proud of?',
      'Which clubs, sports or other activities do you enjoy in school or outside school?',
      'What have you learnt from an activity? If you have not joined one yet, what would you like to try, and why?',
      'Tell me about a time you helped someone or worked well with a team.',
      'What makes a good leader, and how do you try to show those qualities?',
      'What is one responsibility or small leadership role you would like to take on at school?',
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
    expect(text).toContain('Transition to Secondary School: Not enough evidence');
    expect(text).toContain('Not enough evidence yet to highlight a specific strength.');
    expect(text).toContain('Even better if:');
  });
});
