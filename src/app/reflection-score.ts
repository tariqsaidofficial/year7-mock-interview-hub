import { Answer, QUESTIONS } from './interview.models';

export interface ReflectionScore {
  total: number;
  max: 50;
  perQuestion: { questionId: number; score: number; reasons: string[] }[];
  version: 'answer-development-v1';
}
const tokens = (text: string): string[] => text.normalize('NFKC').toLowerCase().replace(/[’']/g, '').match(/[\p{L}\p{N}]+/gu) || [];
const filler = new Set('a an the i me my we our you your it is are was were be to of and or in on at for with this that yes no ok okay um uh'.split(' '));
const phrase = (text: string, pattern: string): boolean => new RegExp(`(?:^| )(${pattern})(?= |$)`, 'u').test(text);
const details: Record<number, string> = {
  1: 'when i|during|timetable|classrooms|homework|different teachers',
  2: 'when i|during|primary school|secondary school|new friends|new teachers',
  3: 'when i|during|we made|we studied|we read|experiment|lesson|fractions',
  4: 'when i|during|i helped|i organised|i organized|i led|our team',
  5: 'when i|during|i listen|i share|i help|our team|group work',
  6: 'when i|during|i made|i finished|i completed|i won|i performed',
  7: 'when i|during|i tried|i asked|i practised|i practiced|i broke',
  8: 'when i|during|each day|every day|practise|practice|homework|revision',
  9: 'when i|during|coding|programming|language|instrument|drawing|public speaking',
  10: 'when i|during|in five years|by then|college|university|qualifications|course|team|study',
};
/** Structural, local indicator only. No relevance, truth, grammar or ability judgement. */
export function scoreReflectionAnswers(answers: readonly Answer[] | null | undefined): ReflectionScore | 'unavailable' {
  if (!Array.isArray(answers) || answers.length !== 10 || new Set(answers.map(a => a?.questionId)).size !== 10 ||
      answers.some(a => !a || typeof a.text !== 'string' || !QUESTIONS.some(q => q.id === a.questionId))) return 'unavailable';
  const perQuestion = QUESTIONS.map(q => {
    const raw = answers.find(a => a.questionId === q.id)!.text;
    const words = tokens(raw.replace(/<[^>]*>/g, ' '));
    const text = words.join(' ');
    const prompts = QUESTIONS.map(item => tokens(item.text).join(' '));
    const reasons: string[] = [];
    if (!text || /^(no answer|no response|not answered|n a)$/.test(text) || prompts.includes(text)) return { questionId: q.id, score: 0, reasons: [prompts.includes(text) ? 'Question text only' : 'No answer'] };
    reasons.push('Attempt');
    // Remove copied prompt wording before counting any development signals.
    const ownText = prompts.reduce((own, prompt) => own.replaceAll(prompt, ''), text).trim();
    const unique = new Set(tokens(ownText).filter(w => w.length > 1 && !filler.has(w)));
    if (unique.size >= 6) reasons.push('Distinct detail words');
    if (unique.size >= 3) {
      if (phrase(ownText, 'because|the reason|this helps|which means|so that|helps me|it helps')) reasons.push('Reason or elaboration');
      if (phrase(ownText, `for example|such as|one time|${details[q.id]}`)) reasons.push('Experience or illustrative detail cue');
      if (phrase(ownText, 'i learned|i learnt|i felt|i feel|i hope|i want to|i would like|next time|i will|i plan|i can now|made me|makes me|feel more|feel happy|want to|hope to|i am proud|im proud')) reasons.push('Reflection or next step cue');
    }
    return { questionId: q.id, score: reasons.length, reasons };
  });
  return { total: perQuestion.reduce((sum, q) => sum + q.score, 0), max: 50, perQuestion, version: 'answer-development-v1' };
}

/** Fixed fictional fixtures only; demo edits never enter the scorer. */
export const DEMO_REFLECTION_ANSWERS: readonly Answer[] = [
  'I use different classrooms now. My timetable helps me because I can find science. I feel more settled.',
  'Secondary school felt busy because we have new teachers. When I met my class I felt welcome.',
  'I enjoy science because we test ideas. During a lesson we made a simple circuit. I want to learn more.',
  'I helped our team share jobs because everyone needed a turn. I learned to listen before deciding.',
  'I listen during group work because quiet people need space. I feel happy when everyone shares an idea.',
  'I finished a drawing during art because I kept trying different shapes. I felt proud of my patience.',
  'I asked for help when I found fractions difficult because I needed another explanation. Next time I will try a diagram.',
  'I want to practise reading every day because new words can be tricky. I will choose a short book.',
  'I would like to learn coding because building small games sounds interesting. I hope to make a puzzle.',
  'In five years I hope to study science because I enjoy solving problems. By then I want to finish a course.',
].map((text, i) => ({ questionId: i + 1, text }));
