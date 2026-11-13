export const CATEGORIES = [
  { id: 'transition', title: 'Transition to Secondary School' },
  { id: 'subjects', title: 'Favourite Subjects' },
  { id: 'activities', title: 'Extra-Curricular Activities' },
  { id: 'leadership', title: 'Leadership and Responsibility' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export type Indicator = 'Strong evidence' | 'Some evidence' | 'Not enough evidence';
export interface Question { id: number; categoryId: CategoryId; text: string; hint: string }
export const QUESTIONS: readonly Question[] = [
  { id: 1, categoryId: 'transition', text: 'What has been the biggest change for you since starting secondary school?', hint: 'Think of one change you have noticed in your school day.' },
  { id: 2, categoryId: 'transition', text: 'What helps you stay organised during the school day?', hint: 'Think of a routine or tool you use yourself.' },
  { id: 3, categoryId: 'transition', text: 'Tell me about something that felt difficult at first. What helped you manage it?', hint: 'Choose a small challenge and what you did next.' },
  { id: 4, categoryId: 'subjects', text: 'Which school subject do you enjoy most, and why?', hint: 'Think about what you like doing or learning in that subject.' },
  { id: 5, categoryId: 'subjects', text: 'Can you describe a lesson, activity or piece of work in that subject that you enjoyed or felt proud of?', hint: 'Recall one real lesson or piece of work.' },
  { id: 6, categoryId: 'activities', text: 'Which clubs, sports or other activities do you enjoy in school or outside school?', hint: 'An activity at home counts too. It is fine if you have not joined one.' },
  { id: 7, categoryId: 'activities', text: 'What have you learnt from an activity? If you have not joined one yet, what would you like to try, and why?', hint: 'Think about a skill you have learnt or an activity you would like to explore.' },
  { id: 8, categoryId: 'leadership', text: 'Tell me about a time you helped someone or worked well with a team.', hint: 'A small, everyday act of help counts.' },
  { id: 9, categoryId: 'leadership', text: 'What makes a good leader, and how do you try to show those qualities?', hint: 'Think about listening, helping or taking responsibility.' },
  { id: 10, categoryId: 'leadership', text: 'What is one responsibility or small leadership role you would like to take on at school?', hint: 'Choose a small action you could realistically try.' },
] as const;
export interface Answer { questionId: number; text: string }
export interface CategoryFeedback { categoryId: CategoryId; indicator: Indicator; evidence: string; nextStep: string }
export interface Evaluation { categories: CategoryFeedback[]; whatWentWell: string[]; evenBetterIf: string; overallSummary: string; formattedCopyableText: string }
export interface CompletedRecord { id: string; runId: string; studentName: string; tutorGroup: string; completedAt: string; answers: Answer[]; evaluation: Evaluation }
