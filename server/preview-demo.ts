import { CATEGORIES, RUBRIC_VERSION, type Evaluation } from '../src/app/interview.models';

export const PREVIEW_DEMO_BRANCH = 'feat/privacy-ready-preview-2026-11-17';

// Both the Vercel environment and the Git branch are mandatory. Production fails closed.
export function previewDemoEnabled(): boolean {
  return process.env['VERCEL_ENV'] === 'preview'
    && process.env['VERCEL_GIT_COMMIT_REF'] === PREVIEW_DEMO_BRANCH
    && process.env['PREVIEW_DEMO_MODE'] === 'true';
}

export function syntheticEvaluation(): Evaluation {
  return {
    rubricVersion: RUBRIC_VERSION,
    categories: CATEGORIES.map((category) => ({
      categoryId: category.id,
      indicator: 'Some evidence' as const,
      evidence: `DEMO example only: a fictional student described an experience related to ${category.title.toLowerCase()}.`,
      nextStep: 'Add a specific example in your own words.',
    })),
    whatWentWell: ['DEMO example only: the fictional student shared a specific experience.'],
    evenBetterIf: 'DEMO example only: add more detail about what you learned.',
    overallSummary: 'DEMO: Fixed synthetic feedback, not an evaluation of your answers.',
    formattedCopyableText: 'DEMO: Synthetic feedback only. This is not a student assessment.',
  };
}
