import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { SpeechService } from './speech.service';
import { Nova3SpeechService } from './experiments/nova3-speech.service';
import { QuestionAudioService } from './question-audio.service';

describe('student screen', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [App], providers: [{ provide: SpeechService, useValue: { status: () => 'Browser fallback unused', recognitionAvailable: () => false, isListening: () => false, stopRecognition: vi.fn() } }, { provide: Nova3SpeechService, useValue: { status: () => 'Stopped', connectionState: () => 'IDLE', recognitionAvailable: () => false, isListening: () => false, isCapturePending: () => false, stopRecognition: vi.fn(), cancelRecognition: vi.fn(), prepareInterview: vi.fn(), provisional: signal(''), confirmed: signal('') } }, { provide: QuestionAudioService, useValue: { message: () => 'Audio unavailable', state: () => 'unavailable', enterQuestion: vi.fn(), stop: vi.fn(), reset: vi.fn() } }] });
    return TestBed.createComponent(App);
  }
  it('shows the fixed interview welcome screen and setup action', async () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your voice.');
    expect(fixture.nativeElement.textContent).toContain("I'm ready to begin");
  });

  it('uses Nova-3 for the normal interview without a query flag', () => {
    const fixture = setup();
    expect(fixture.componentInstance.speech).toBe(fixture.componentInstance.nova);
    expect(fixture.componentInstance.useNova3).toBe(true);
  });

  it('prepares Nova capture at Begin Interview', () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.form.setValue({ name: 'Synthetic Student', group: '7A' });
    app.interview.stage.set('sound-check');
    app.start();
    expect(app.nova.prepareInterview).toHaveBeenCalledOnce();
    expect(app.interview.stage()).toBe('interview');
    app.finishAndClear();
  });

  it('waits for speech finalisation before changing questions', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.interview.stage.set('interview');
    let finish!: (success: boolean) => void;
    vi.mocked(app.nova.stopRecognition).mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const navigation = app.next();
    expect(app.interview.index()).toBe(0);
    finish(true);
    await navigation;
    expect(app.interview.index()).toBe(1);
    app.finishAndClear();
  });

  it('keeps the current question when finalisation fails', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.interview.stage.set('interview');
    vi.mocked(app.nova.stopRecognition).mockResolvedValueOnce(false);
    await app.next();
    expect(app.interview.index()).toBe(0);
    expect(app.nova.stopRecognition).toHaveBeenCalledTimes(1);
    app.finishAndClear();
  });

  it('waits for speech to stop before an intentional Skip and does not stop it twice', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.interview.stage.set('interview');
    let finish!: (success: boolean) => void;
    vi.mocked(app.nova.stopRecognition).mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const navigation = app.skip();
    expect(app.interview.index()).toBe(0);
    finish(false);
    await navigation;
    expect(app.interview.index()).toBe(1);
    expect(app.nova.stopRecognition).toHaveBeenCalledTimes(1);
    app.finishAndClear();
  });

  it('loads every teacher page beyond the former 100-record ceiling', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    const records = Array.from({ length: 100 }, (_, index) => ({ id: `synthetic-${index}`, studentName: `Synthetic ${index}`, tutorGroup: '7A', completedAt: '2026-11-15T00:00:00Z', answers: [], evaluation: {} }));
    const makePage = (slice: typeof records, nextCursor: string | null) => new Response(JSON.stringify({ runId: 'synthetic-run', records: slice, pendingCount: 0, nextCursor }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makePage(records.slice(0, 50), 'a'.repeat(64))).mockResolvedValueOnce(makePage(records.slice(50), 'b'.repeat(64))).mockResolvedValueOnce(makePage([{ ...records[0], id: 'synthetic-100' }], null));
    try {
      await app.refresh();
      expect(app.records()).toHaveLength(101);
      expect(app.runId()).toBe('synthetic-run');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toContain(`cursor=${'a'.repeat(64)}`);
    } finally { fetchMock.mockRestore(); }
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
    expect(root.querySelectorAll('.report-card')).toHaveLength(4);
    expect(Array.from(root.querySelectorAll('.report-indicator')).map((item) => item.textContent)).toEqual(['Some evidence', 'Strong evidence', 'Not enough evidence', 'Some evidence']);
    expect(root.textContent).toContain('You explained a routine.');
    expect(root.textContent).toContain('A small next step');
    expect(root.querySelector('.summary-actions .primary-button')?.textContent).toContain('Copy feedback');
    expect(root.textContent).not.toMatch(/\b\d+%/);
  });

  it('shows an honest empty-strength state without a made-up score', () => {
    const fixture = setup(); const interview = fixture.componentInstance.interview;
    interview.evaluation.set({ categories: ['transition', 'subjects', 'activities', 'leadership'].map((categoryId) => ({ categoryId: categoryId as 'transition' | 'subjects' | 'activities' | 'leadership', indicator: 'Not enough evidence', evidence: 'No relevant example.', nextStep: 'Share one example.' })), whatWentWell: [], evenBetterIf: 'Try one example.', overallSummary: 'There is not enough evidence yet.', formattedCopyableText: 'Exact copy text.' });
    interview.stage.set('results'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Not enough evidence yet to highlight a specific strength.');
    expect(root.querySelectorAll('.strength-list li')).toHaveLength(0);
    expect(root.querySelectorAll('.report-card')).toHaveLength(4);
    expect(root.querySelectorAll('.report-indicator')).toHaveLength(4);
    expect(root.querySelectorAll('.summary-actions .primary-button')).toHaveLength(1);
  });

  it('clears in-memory student details after finishing', () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.form.setValue({ name: 'Test Student', group: '7A' });
    app.interview.name.set('Test Student');
    app.interview.group.set('7A');
    app.interview.stage.set('results');
    app.finishAndClear();
    expect(app.interview.stage()).toBe('welcome');
    expect(app.form.value).toEqual({ name: '', group: '' });
    expect(app.interview.name()).toBe('');
    expect(app.interview.group()).toBe('');
    expect(app.audio.reset).toHaveBeenCalled();
  });

  it('closes a microphone permission result that arrives after sound check stops', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    const originalDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const originalContext = window.AudioContext;
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {} });
    try {
      app.interview.stage.set('sound-check');
      const pending = app.startSoundCheck();
      app.stopSoundCheck();
      grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
      await pending;
      expect(stop).toHaveBeenCalledOnce();
      expect(app.soundCheckActive()).toBe(false);
    } finally {
      if (originalDevices) Object.defineProperty(navigator, 'mediaDevices', originalDevices);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: originalContext });
    }
  });
});
