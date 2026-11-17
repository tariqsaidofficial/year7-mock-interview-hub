export const RUBRIC_VERSION = 2 as const;
export const CATEGORIES = [
  { id: 'transition', title: 'Transition & Adjustment', description: 'Changes, routines and finding your way' },
  { id: 'learning', title: 'Learning & Curiosity', description: 'Subjects and skills you want to explore' },
  { id: 'relationships', title: 'Relationships & Leadership', description: 'Friendship, teamwork and helping others' },
  { id: 'growth', title: 'Growth & Aspirations', description: 'Achievements, challenges and future hopes' },
] as const;
export const LEGACY_CATEGORIES = [
  { id: 'transition', title: 'Transition to Secondary School' },
  { id: 'subjects', title: 'Favourite Subjects' },
  { id: 'activities', title: 'Extra-Curricular Activities' },
  { id: 'leadership', title: 'Leadership and Responsibility' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export type LegacyCategoryId = (typeof LEGACY_CATEGORIES)[number]['id'];
export type FeedbackCategoryId = CategoryId | LegacyCategoryId;
export type Indicator = 'Strong evidence' | 'Some evidence' | 'Not enough evidence';
export interface Question { id: number; categoryId: CategoryId; text: string; hint: string }
export const QUESTIONS: readonly Question[] = [
  { id: 1, categoryId: 'transition', text: 'What has been the biggest change for you since starting secondary school?', hint: 'Think of one change you have noticed in your school day.' },
  { id: 2, categoryId: 'transition', text: 'How have you found the transition from primary to secondary school? What has been the biggest change for you so far?', hint: 'Think about one change and how it has felt for you.' },
  { id: 3, categoryId: 'learning', text: 'What is your favourite subject at school and why? What do you enjoy most about learning it?', hint: 'Think of something you enjoy learning or doing in that subject.' },
  { id: 4, categoryId: 'relationships', text: 'What does being a good leader mean to you? Can you give an example of a time when you have shown leadership, either in or outside school?', hint: 'A small moment when you helped or guided others counts.' },
  { id: 5, categoryId: 'relationships', text: 'What do you think makes someone a good friend and a good team member? How do you contribute when working with others?', hint: 'Think about listening, including others or sharing a task.' },
  { id: 6, categoryId: 'growth', text: 'What has been your proudest achievement so far? It could be something academic, sporting, creative or personal.', hint: 'Choose something that mattered to you and say why.' },
  { id: 7, categoryId: 'growth', text: 'What do you do when you find something difficult or make a mistake? Can you give an example of how you overcome a challenge?', hint: 'Think of one challenge and what you tried next.' },
  { id: 8, categoryId: 'growth', text: 'If you could improve one thing about yourself this academic year, what would it be and why?', hint: 'Choose one skill or habit you would like to work on.' },
  { id: 9, categoryId: 'learning', text: 'What new skill would you like to learn or develop during your time at secondary school? How might this help you in the future?', hint: 'Think about a skill you are curious to try and how it could help.' },
  { id: 10, categoryId: 'growth', text: "Where do you see yourself in five years' time? What would you like to have achieved by then?", hint: 'Share one hope for the future in your own words.' },
] as const;
export const LEGACY_QUESTION_TEXT = [
  QUESTIONS[0].text,
  'What helps you stay organised during the school day?',
  'Tell me about something that felt difficult at first. What helped you manage it?',
  'Which school subject do you enjoy most, and why?',
  'Can you describe a lesson, activity or piece of work in that subject that you enjoyed or felt proud of?',
  'Which clubs, sports or other activities do you enjoy in school or outside school?',
  'What have you learnt from an activity? If you have not joined one yet, what would you like to try, and why?',
  'Tell me about a time you helped someone or worked well with a team.',
  'What makes a good leader, and how do you try to show those qualities?',
  'What is one responsibility or small leadership role you would like to take on at school?',
] as const;
export function categoryTitle(id: FeedbackCategoryId, rubricVersion?: number): string {
  const categories: readonly { id: string; title: string }[] = rubricVersion === RUBRIC_VERSION ? CATEGORIES : LEGACY_CATEGORIES;
  return categories.find((category) => category.id === id)?.title || id;
}
export interface Answer { questionId: number; text: string }
export interface CategoryFeedback { categoryId: FeedbackCategoryId; indicator: Indicator; evidence: string; nextStep: string }
export interface Evaluation { rubricVersion?: 1 | 2; categories: CategoryFeedback[]; whatWentWell: string[]; evenBetterIf: string; overallSummary: string; formattedCopyableText: string }
export interface CompletedRecord { id: string; runId: string; studentName: string; tutorGroup: string; completedAt: string; answers: Answer[]; evaluation: Evaluation; rubricVersion?: 1 | 2 }
