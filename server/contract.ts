import { z } from 'zod';
import { CATEGORIES, QUESTIONS, Evaluation } from '../src/app/interview.models';
export const modelName = 'anthropic/claude-haiku-5.5';
export const submissionSchema = z.strictObject({
  requestId: z.string().uuid(),
  studentName: z.string().trim().min(2).max(80),
  tutorGroup: z.string().trim().min(1).max(30),
  answers: z.array(z.strictObject({ questionId: z.number().int().min(1).max(10), text: z.string().max(1200) })).length(10),
}).refine((v) => v.answers.every((a, i) => a.questionId === QUESTIONS[i].id), 'Answers must use the ten fixed question IDs in order');
const indicator = z.enum(['Strong evidence', 'Some evidence', 'Not enough evidence']);
export const modelSchema = z.strictObject({
  categories: z.array(z.strictObject({
    categoryId: z.enum(['transition', 'subjects', 'activities', 'leadership']),
    indicator,
    evidence: z.string().trim().min(4).max(280),
    nextStep: z.string().trim().min(4).max(280),
  })).length(4),
  whatWentWell: z.array(z.string().trim().min(4).max(250)).max(2),
  evenBetterIf: z.string().trim().min(4).max(250),
  overallSummary: z.string().trim().min(150).max(1100),
}).refine((v) => v.categories.every((c, i) => c.categoryId === CATEGORIES[i].id), 'Categories must be in fixed order');
export type ModelOutput = z.infer<typeof modelSchema>;
export function validateEvaluation(raw: unknown, answers: {questionId: number; text: string}[]): Evaluation {
  const output = modelSchema.parse(raw);
  const answered = answers.filter((answer) => answer.text.trim()).length;
  if (output.whatWentWell.length > answered) throw new Error('Unsupported strength count');
  if (output.whatWentWell.length && output.categories.every((category) => category.indicator === 'Not enough evidence')) throw new Error('Strength without category evidence');
  for (const c of output.categories) {
    const hasAnswer = QUESTIONS.some((q) => q.categoryId === c.categoryId && answers[q.id - 1]?.text.trim());
    if (!hasAnswer && c.indicator !== 'Not enough evidence') throw new Error('Unsupported category indicator');
  }
  const words = output.overallSummary.trim().split(/\s+/).length;
  if (words < 65 || words > 140) throw new Error('Summary length outside acceptable range');
  const forbidden = /\b(?:\d{1,3}%|greater depth|secure standard|developing standard|working towards)\b/i;
  if ([...output.categories.flatMap((c) => [c.evidence, c.nextStep]), ...output.whatWentWell, output.evenBetterIf, output.overallSummary].some((x) => forbidden.test(x))) throw new Error('Unapproved grade or percentage');
  return { ...output, formattedCopyableText: formatFeedback(output) };
}
export function formatFeedback(value: ModelOutput): string {
  return [
    'Year 7 mock interview feedback',
    ...value.categories.map((c, i) => `${CATEGORIES[i].title}: ${c.indicator}\nEvidence: ${c.evidence}\nNext step: ${c.nextStep}`),
    value.whatWentWell.length ? `What went well:\n${value.whatWentWell.map((strength) => `• ${strength}`).join('\n')}` : 'What went well: Not enough evidence yet to highlight a specific strength.',
    `Even better if: ${value.evenBetterIf}`,
    `Summary: ${value.overallSummary}`,
  ].join('\n\n');
}
export const responseJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['categories', 'whatWentWell', 'evenBetterIf', 'overallSummary'],
  properties: {
    categories: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['categoryId', 'indicator', 'evidence', 'nextStep'], properties: {
      categoryId: { type: 'string', enum: CATEGORIES.map((c) => c.id) },
      indicator: { type: 'string', enum: ['Strong evidence', 'Some evidence', 'Not enough evidence'] },
      evidence: { type: 'string' }, nextStep: { type: 'string' },
    } } },
    whatWentWell: { type: 'array', minItems: 0, maxItems: 2, items: { type: 'string' } },
    evenBetterIf: { type: 'string' }, overallSummary: { type: 'string' },
  },
};
