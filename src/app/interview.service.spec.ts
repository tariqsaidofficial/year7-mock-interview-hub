import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewService, STUDENT_CSRF } from './interview.service';
import { Nova3SpeechService } from './experiments/nova3-speech.service';
import { QuestionAudioService } from './question-audio.service';
import { saveDraft } from './draft';
import { DEMO_REFLECTION_ANSWERS, scoreReflectionAnswers } from './reflection-score';
import { CATEGORIES, QUESTIONS } from './interview.models';
import { loadResult, saveResult } from './result-store';

describe('supportive interview timing', () => {
  beforeEach(() => {
    // Node may expose an undefined global localStorage unless --localstorage-file is set.
    // Keep this suite independent of that runtime option.
    if (!globalThis.localStorage) {
      const entries = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => { entries.set(key, String(value)); },
        removeItem: (key: string) => { entries.delete(key); },
        clear: () => { entries.clear(); },
        key: (index: number) => [...entries.keys()][index] ?? null,
        get length() { return entries.size; },
      } satisfies Storage);
    }
    localStorage.clear(); sessionStorage.clear(); TestBed.resetTestingModule();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T08:00:00Z'));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  function service() {
    const speech = { stopRecognition: vi.fn(), cancelRecognition: vi.fn() };
    const audio = { enterQuestion: vi.fn(), stop: vi.fn(), reset: vi.fn() };
    TestBed.configureTestingModule({ providers: [InterviewService, { provide: Nova3SpeechService, useValue: speech }, { provide: QuestionAudioService, useValue: audio }, { provide: STUDENT_CSRF, useValue: vi.fn().mockResolvedValue('test-csrf') }] });
    return { interview: TestBed.inject(InterviewService), speech, audio };
  }

  it('scores only fixed demo fixtures even if the visitor edits an answer', () => {
    const { interview } = service();
    interview.enableSyntheticDemo(); interview.stage.set('sound-check'); interview.start('Demo Student', '7A');
    interview.updateAnswer('A visitor edit must never be scored');
    interview.evaluation.set({ rubricVersion: 2, categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: '', formattedCopyableText: '' });
    expect(interview.reflectionScore()).toEqual(scoreReflectionAnswers(DEMO_REFLECTION_ANSWERS));
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
    interview.clear();
  });

  it('does not infer scores from qualitative results or old rubric records', () => {
    const { interview } = service();
    for (const rubricVersion of [1, 2] as const) {
      interview.evaluation.set({ rubricVersion, categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: '', formattedCopyableText: '' });
      expect(interview.reflectionScore()).toBe('unavailable');
    }
    interview.clear();
  });

  it('recovers a grounded V2 answer score but rejects incomplete restored answer provenance', () => {
    const id = 'restored-score';
    const draft = { version: 2 as const, questionSetVersion: 2 as const, id, name: 'Synthetic Adult', group: '7A', answers: [...DEMO_REFLECTION_ANSWERS], index: 9, startedAt: Date.now(), updatedAt: Date.now() };
    const evaluation = { rubricVersion: 2 as const, categories: CATEGORIES.map(c => ({categoryId:c.id,indicator:'Some evidence' as const,evidence:'Synthetic',nextStep:'Try detail'})),whatWentWell:[],evenBetterIf:'Try detail',overallSummary:'Synthetic',formattedCopyableText:'Synthetic'};
    saveDraft(draft); saveResult(id,evaluation);
    let current = service().interview;
    expect(current.reflectionScore()).toEqual(scoreReflectionAnswers(DEMO_REFLECTION_ANSWERS));
    current.clear(); TestBed.resetTestingModule();
    saveDraft({...draft,answers:draft.answers.slice(1)}); saveResult(id,evaluation);
    current=service().interview;
    expect(current.reflectionScore()).toBe('unavailable'); current.clear();
  });

  it('derives the live score from the actual submitted answers, never the demo fixture or AI feedback', async () => {
    const evaluation = { rubricVersion: 2 as const, categories: [],whatWentWell:[],evenBetterIf:'',overallSummary:'',formattedCopyableText:'Synthetic test only'};
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({evaluation}),{headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',fetcher);
    const { interview }=service(); interview.stage.set('sound-check'); interview.start('Synthetic Adult','7A');
    interview.updateAnswer('Science');
    const submitted=interview.answers().map(a=>({...a}));
    await interview.submit();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).answers).toEqual(submitted);
    expect(interview.demoMode()).toBe(false);
    expect(interview.reflectionScore()).toEqual(scoreReflectionAnswers(submitted));
    expect(interview.reflectionScore()).toMatchObject({total:1});
    expect(interview.reflectionScore()).not.toEqual(scoreReflectionAnswers(DEMO_REFLECTION_ANSWERS));
    interview.clear();
  });

  it('counts down gently and does not submit, lock typing or interrupt audio after eight minutes', () => {
    const { interview, audio, speech } = service();
    interview.showSetup(); interview.stage.set('sound-check'); interview.start('Example Student', '7A');
    const startedAt = interview.startedAt();
    expect(interview.timeText()).toBe('08:00');
    expect(interview.nearGuide()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(interview.timeText()).toBe('07:59');
    vi.advanceTimersByTime(7 * 60_000 + 28_000);
    expect(interview.timeText()).toBe('00:31');
    expect(interview.nearGuide()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(interview.timeText()).toBe('00:30');
    expect(interview.nearGuide()).toBe(true);
    vi.advanceTimersByTime(90_000);
    expect(interview.stage()).toBe('interview');
    expect(interview.timeText()).toBe('00:00');
    expect(interview.pastGuide()).toBe(true);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(speech.stopRecognition).not.toHaveBeenCalled();
    interview.updateAnswer('My answer after the suggested time.');
    expect(interview.currentAnswer()).toBe('My answer after the suggested time.');
    interview.move(1); interview.move(-1);
    expect(interview.currentAnswer()).toBe('My answer after the suggested time.');
    expect(interview.startedAt()).toBe(startedAt);
    interview.clear(); vi.useRealTimers();
  });

  it('finishes only when Finish Interview is selected on question ten', async () => {
    const { interview } = service();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    interview.showSetup(); interview.stage.set('sound-check'); interview.start('Example Student', '7A');
    interview.index.set(9);
    interview.next();
    await Promise.resolve();
    expect(interview.stage()).toBe('offline-pending');
    online.mockRestore(); interview.clear(); vi.useRealTimers();
  });

  it('stops the primary Nova-3 microphone when connectivity is interrupted', () => {
    const { interview, speech } = service();
    interview.showSetup(); interview.stage.set('sound-check'); interview.start('Example Student', '7A');
    window.dispatchEvent(new Event('offline'));
    expect(speech.stopRecognition).toHaveBeenCalled();
    expect(interview.online()).toBe(false);
    interview.clear();
  });

  it('restores a draft with its original countdown and answer', () => {
    const startedAt = Date.now() - 60_000;
    saveDraft({ version: 2, questionSetVersion: 2, id: crypto.randomUUID(), name: 'Example Student', group: '7A', answers: QUESTIONS.map((q) => ({ questionId: q.id, text: q.id === 3 ? 'My saved answer.' : '' })), index: 2, startedAt, updatedAt: Date.now() });
    const { interview } = service();
    expect(interview.stage()).toBe('resume-draft');
    expect(interview.timeText()).toBe('07:00');
    expect(interview.currentAnswer()).toBe('My saved answer.');
    interview.resume();
    vi.advanceTimersByTime(1_000);
    expect(interview.timeText()).toBe('06:59');
    expect(interview.currentAnswer()).toBe('My saved answer.');
    interview.clear(); vi.useRealTimers();
  });

  it('keeps an earlier question-set draft copyable without resuming it as V2', async () => {
    const startedAt = Date.now() - 60_000;
    saveDraft({ version: 2, id: crypto.randomUUID(), name: 'Example Student', group: '7A', answers: [{ questionId: 2, text: 'My earlier answer.' }], index: 1, startedAt, updatedAt: Date.now() });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, onLine: true });
    const { interview } = service();
    expect(interview.stage()).toBe('legacy-draft');
    interview.resume();
    expect(interview.stage()).toBe('legacy-draft');
    await interview.copyAnswers();
    expect(writeText.mock.calls[0][0]).toContain('What helps you stay organised during the school day?');
    expect(writeText.mock.calls[0][0]).toContain('My earlier answer.');
    interview.clear();
  });

  it('keeps validated feedback through refresh and clears it only on explicit finish', async () => {
    const evaluation = { categories: ['transition', 'subjects', 'activities', 'leadership'].map((categoryId) => ({ categoryId, indicator: 'Not enough evidence', evidence: 'No relevant answer.', nextStep: 'Share an example.' })), whatWentWell: [], evenBetterIf: 'Try an example.', overallSummary: 'There is not enough evidence yet.', formattedCopyableText: 'Exact feedback text.' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ evaluation }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const { interview } = service(); interview.showSetup(); interview.stage.set('sound-check'); interview.start('Example Student', '7A'); interview.updateAnswer('My answer.');
    await interview.submit();
    expect(interview.stage()).toBe('results');
    const runId = JSON.parse(localStorage.getItem('year7-interview-draft-v1') || '{}').id as string;
    expect(loadResult(runId)?.formattedCopyableText).toBe('Exact feedback text.');
    TestBed.resetTestingModule();
    const restored = service().interview;
    expect(restored.stage()).toBe('results');
    expect(restored.evaluation()?.formattedCopyableText).toBe('Exact feedback text.');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await restored.copyFeedback();
    expect(writeText).toHaveBeenCalledWith('Exact feedback text.');
    restored.clear();
    expect(localStorage.getItem('year7-interview-draft-v1')).toBeNull();
    expect(loadResult(runId)).toBeNull();
  });

  it('reports HTML API responses plainly and preserves answers for retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><title>Not Found</title>', { status: 404, headers: { 'Content-Type': 'text/html' } })));
    const { interview } = service(); interview.showSetup(); interview.stage.set('sound-check'); interview.start('Example Student', '7A'); interview.updateAnswer('My exact answer.');
    await interview.submit();
    expect(interview.stage()).toBe('evaluation-error');
    expect(interview.message()).toContain('unexpected page');
    expect(interview.message()).not.toContain('<!doctype');
    expect(interview.currentAnswer()).toBe('My exact answer.');
    expect(localStorage.getItem('year7-interview-draft-v1')).toContain('My exact answer.');
    interview.clear();
  });

  it('leaves the loading screen if the evaluation request hangs', async () => {
    const pending = vi.fn(() => new Promise<Response>((resolve) => { void resolve; }));
    vi.stubGlobal('fetch', pending);
    const { interview } = service(); interview.showSetup(); interview.stage.set('sound-check'); interview.start('Example Student', '7A'); interview.updateAnswer('My exact answer.');
    const submission = interview.submit();
    await vi.advanceTimersByTimeAsync(70_000);
    await submission;
    expect(interview.stage()).toBe('evaluation-error');
    expect(interview.message()).toContain('taking longer than expected');
    expect(interview.currentAnswer()).toBe('My exact answer.');
    expect(localStorage.getItem('year7-interview-draft-v1')).toContain('My exact answer.');
    interview.clear();
  });

  it('shows manual-copy guidance if the clipboard rejects feedback', async () => {
    const { interview } = service();
    interview.evaluation.set({ categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: '', formattedCopyableText: 'Exact feedback text.' });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    await interview.copyFeedback();
    expect(interview.copyMessage()).toContain('Select the feedback text');
    interview.clear();
  });

  it('expires a temporary result after one day', () => {
    const id = crypto.randomUUID();
    saveResult(id, { categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: '', formattedCopyableText: 'Temporary result' });
    vi.advanceTimersByTime(86_400_001);
    expect(loadResult(id)).toBeNull();
    sessionStorage.clear();
  });
});
