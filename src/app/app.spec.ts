import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { SpeechService } from './speech.service';
import { Nova3SpeechService } from './experiments/nova3-speech.service';
import { QuestionAudioService } from './question-audio.service';

describe('student screen', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [App], providers: [{ provide: SpeechService, useValue: { status: () => 'Browser fallback unused', recognitionAvailable: () => false, isListening: () => false, stopRecognition: vi.fn() } }, { provide: Nova3SpeechService, useValue: { status: () => 'Stopped', recognitionAvailable: () => false, isListening: () => false, stopRecognition: vi.fn(), cancelRecognition: vi.fn(), provisional: () => '', confirmed: () => '' } }, { provide: QuestionAudioService, useValue: { message: () => 'Audio unavailable', state: () => 'unavailable', enterQuestion: vi.fn(), stop: vi.fn(), reset: vi.fn() } }] });
    return TestBed.createComponent(App);
  }
  it('shows the fixed interview welcome screen and setup action', async () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your Year 7 mock interview');
    expect(fixture.nativeElement.textContent).toContain('Get started');
  });

  it('uses Nova-3 for the normal interview without a query flag', () => {
    const fixture = setup();
    expect(fixture.componentInstance.speech).toBe(fixture.componentInstance.nova);
    expect(fixture.componentInstance.useNova3).toBe(true);
  });

  it('warns before setup when the classroom run is closed or status cannot be checked', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ open: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })).mockResolvedValueOnce(new Response('<!doctype html>', { status: 404, headers: { 'Content-Type': 'text/html' } })).mockResolvedValueOnce(new Response(JSON.stringify({ open: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    try {
      await app.openSetup();
      expect(app.interview.stage()).toBe('welcome'); expect(app.availabilityMessage()).toContain('not open');
      await app.openSetup();
      expect(app.interview.stage()).toBe('welcome'); expect(app.availabilityMessage()).toContain('could not be checked');
      await app.openSetup();
      expect(app.interview.stage()).toBe('setup');
    } finally { fetchMock.mockRestore(); }
  });

  it('shows the illustrative motion only while evaluating', () => {
    const fixture = setup(); const interview = fixture.componentInstance.interview;
    interview.stage.set('evaluating'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.analysis-ring')).toHaveLength(2);
    expect(root.querySelectorAll('.analysis-theme')).toHaveLength(4);
    expect(root.querySelector('.analysis-visual')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.textContent).toContain('Preparing your feedback');
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
    expect(root.textContent).not.toMatch(/\d+%/);
    interview.stage.set('evaluation-error'); fixture.detectChanges();
    expect(root.querySelector('.analysis-ring')).toBeNull();
    interview.stage.set('offline-pending'); fixture.detectChanges();
    expect(root.querySelector('.analysis-ring')).toBeNull();
  });

  it('renders all four evidence cards and a copy action from validated feedback', () => {
    const fixture = setup();
    const interview = fixture.componentInstance.interview;
    interview.name.set('Preview Student');
    interview.evaluation.set({
      categories: [
        { categoryId: 'transition', indicator: 'Some evidence', evidence: 'I found a new routine.', nextStep: 'Try one more routine.' },
        { categoryId: 'subjects', indicator: 'Strong evidence', evidence: 'I enjoy reading.', nextStep: 'Share a book.' },
        { categoryId: 'activities', indicator: 'Not enough evidence', evidence: 'No example shared.', nextStep: 'Explore one activity.' },
        { categoryId: 'leadership', indicator: 'Some evidence', evidence: 'I helped a classmate.', nextStep: 'Keep helping.' },
      ],
      whatWentWell: ['You explained a routine.', 'You shared a real example.'],
      evenBetterIf: 'Add one more detail.',
      overallSummary: 'A thoughtful reflection.',
      formattedCopyableText: 'A thoughtful reflection.',
    });
    interview.stage.set('results');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.feedback-card')).toHaveLength(4);
    expect(root.querySelectorAll('.snapshot-topic')).toHaveLength(4);
    expect(Array.from(root.querySelectorAll('.snapshot-topic small')).map((item) => item.textContent)).toEqual(['Some evidence', 'Strong evidence', 'Not enough evidence', 'Some evidence']);
    expect(root.textContent).toContain('Strengths from your answers');
    expect(root.textContent).toContain('One small next step');
    expect(root.querySelector('.results-hero button')?.textContent).toContain('Copy feedback');
    expect(root.textContent).not.toMatch(/\b\d+%/);
  });

  it('shows an honest empty-strength state without a made-up score', () => {
    const fixture = setup(); const interview = fixture.componentInstance.interview;
    interview.evaluation.set({ categories: ['transition', 'subjects', 'activities', 'leadership'].map((categoryId) => ({ categoryId: categoryId as 'transition' | 'subjects' | 'activities' | 'leadership', indicator: 'Not enough evidence', evidence: 'No relevant example.', nextStep: 'Share one example.' })), whatWentWell: [], evenBetterIf: 'Try one example.', overallSummary: 'There is not enough evidence yet.', formattedCopyableText: 'Exact copy text.' });
    interview.stage.set('results'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Not enough evidence yet to highlight a specific strength.');
    expect(root.querySelectorAll('.strength-list li')).toHaveLength(0);
    expect(root.querySelector('.snapshot-facts')?.textContent).toContain('0strengths supported by answers');
    expect(root.querySelectorAll('.summary-actions .primary-button')).toHaveLength(1);
  });
});
