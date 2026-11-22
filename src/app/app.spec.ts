import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { SpeechService } from './speech.service';
import { Nova3SpeechService } from './experiments/nova3-speech.service';
import { QuestionAudioService } from './question-audio.service';
import { loadDraft } from './draft';

describe('student screen', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [App], providers: [{ provide: SpeechService, useValue: { status: () => 'Browser fallback unused', recognitionAvailable: () => false, isListening: () => false, stopRecognition: vi.fn() } }, { provide: Nova3SpeechService, useValue: { status: signal('Stopped'), connectionState: vi.fn(() => 'IDLE'), recognitionAvailable: vi.fn(() => false), isListening: vi.fn(() => false), isCapturePending: vi.fn(() => false), startRecognition: vi.fn(), stopRecognition: vi.fn(), cancelRecognition: vi.fn(), prepareInterview: vi.fn(), provisional: signal(''), confirmed: signal(''), audioLevel: signal(0) } }, { provide: QuestionAudioService, useValue: { message: signal('Audio unavailable'), state: vi.fn(() => 'unavailable'), replay: vi.fn(), enterQuestion: vi.fn(), stop: vi.fn(), reset: vi.fn() } }] });
    return TestBed.createComponent(App);
  }
  function startSyntheticInterview(app: App) {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } });
    app.interview.stage.set('sound-check');
    app.interview.start('Synthetic Adult', '7A');
    app.answer.setValue('My confirmed answer', { emitEvent: false });
    app.interview.updateAnswer('My confirmed answer');
  }
  function mockDialog() {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); } });
  }
  afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.useRealTimers(); history.replaceState({}, '', '/'); });
  it('uses one editable answer, a compact recorder and a short accessible replay control', async () => {
    const fixture=setup(),app=fixture.componentInstance; startSyntheticInterview(app);
    vi.mocked(app.nova.recognitionAvailable).mockReturnValue(true);
    vi.mocked(app.nova.connectionState).mockReturnValue('READY');
    app.nova.status.set('Speech connection ready. Tap to speak.');
    vi.mocked(app.audio.state).mockReturnValue('idle'); app.audio.message.set('Question audio finished.');
    fixture.detectChanges(); const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('#answer')).toHaveLength(1);
    expect(root.querySelector('.confirmed-panel')).toBeNull();
    expect(root.querySelector('.compact-microphone-status')?.textContent).toBe('Tap to speak');
    expect(root.textContent).not.toContain('Speech connection ready. Tap to speak.');
    expect(root.querySelector('.question-audio-feedback')?.classList.contains('question-feedback-hidden')).toBe(true);
    const replay=root.querySelector<HTMLButtonElement>('.replay-button')!;
    expect(replay.textContent).toContain('Listen again'); expect(replay.getAttribute('aria-label')).toBe('Listen to the question again');
    await app.replayQuestion(); expect(app.audio.replay).toHaveBeenCalledWith(1);
    vi.mocked(app.audio.state).mockReturnValue('playing'); fixture.detectChanges(); expect(replay.textContent).toContain('Playing…');
    expect(root.querySelector('label[for="answer"]')?.textContent).toContain('Your answer (edit or type your own words)');
    app.finishAndClear(); fixture.destroy();
  });

  it('reports real capture, finalisation, completion and failure states without claiming idle readiness', () => {
    const fixture=setup(),app=fixture.componentInstance;
    vi.mocked(app.nova.recognitionAvailable).mockReturnValue(true);
    expect(app.questionMicStatus()).toBe('Tap to speak');
    vi.mocked(app.nova.isCapturePending).mockReturnValue(true); expect(app.questionMicStatus()).toBe('Starting microphone…');
    vi.mocked(app.nova.isCapturePending).mockReturnValue(false); vi.mocked(app.nova.isListening).mockReturnValue(true);
    vi.mocked(app.nova.connectionState).mockReturnValue('RECORDING_LOCAL'); expect(app.questionMicStatus()).toBe('Listening to you…');
    vi.mocked(app.nova.connectionState).mockReturnValue('FINALISING'); expect(app.questionMicStatus()).toBe('Adding your words…');
    vi.mocked(app.nova.isListening).mockReturnValue(false); vi.mocked(app.nova.connectionState).mockReturnValue('CLOSED');
    expect(app.questionMicStatus()).toBe('Tap to speak'); app.nova.confirmed.set('Confirmed words'); expect(app.questionMicStatus()).toBe('Your answer is ready to edit');
    vi.mocked(app.nova.connectionState).mockReturnValue('ERROR'); expect(app.questionMicStatus()).toBe('Microphone unavailable. You can type instead.');
    app.nova.status.set('Microphone permission was denied. You can type every answer.'); vi.mocked(app.nova.connectionState).mockReturnValue('PREPARING');
    expect(app.questionSpeechProblem()).toBe(true); expect(app.questionMicStatus()).toContain('Microphone unavailable'); fixture.destroy();
  });

  it('keeps confirmed speech in the editor without duplicates and preserves edits against late callbacks', async () => {
    const fixture=setup(),app=fixture.componentInstance; startSyntheticInterview(app);
    vi.mocked(app.nova.recognitionAvailable).mockReturnValue(true);
    let onText!: (text:string)=>void;
    vi.mocked(app.nova.startRecognition).mockImplementation(callback=>{onText=(text)=>callback(text,true);return true;});
    await app.toggleMic(); vi.mocked(app.nova.isListening).mockReturnValue(true);
    app.nova.provisional.set('not yet confirmed'); app.nova.confirmed.set('spoken words'); onText('ignored interim'); onText('ignored repeat');
    expect(app.answer.value).toBe('My confirmed answer spoken words');
    fixture.detectChanges(); expect((fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#answer')?.value).toBe(app.answer.value);
    expect(app.answer.value).not.toContain('not yet confirmed');
    app.answer.setValue('My manually edited answer'); app.nova.confirmed.set('late words'); onText('late words');
    expect(app.answer.value).toBe('My manually edited answer'); expect(loadDraft()?.answers[0].text).toBe('My manually edited answer');
    vi.mocked(app.nova.isListening).mockReturnValue(false); await app.toggleMic(); app.nova.confirmed.set('a fresh segment'); onText('fresh');
    expect(app.answer.value).toBe('My manually edited answer a fresh segment'); app.finishAndClear(); fixture.destroy();
  });

  it('retains the final segment through Next and Back and keeps a usable editor after permission refusal', async () => {
    const fixture=setup(),app=fixture.componentInstance; startSyntheticInterview(app);
    vi.mocked(app.nova.recognitionAvailable).mockReturnValue(true);
    let onText!: (text:string)=>void;vi.mocked(app.nova.startRecognition).mockImplementation(callback=>{onText=(text)=>callback(text,true);return true;});
    await app.toggleMic();let finish!: (ok:boolean)=>void;vi.mocked(app.nova.stopRecognition).mockReturnValueOnce(new Promise<boolean>(resolve=>{finish=resolve;}));
    const pending=app.next();expect(app.interview.index()).toBe(0);app.nova.confirmed.set('the final segment');onText('final');finish(true);await pending;
    await app.move(-1);expect(app.answer.value).toBe('My confirmed answer the final segment');
    app.nova.status.set('Microphone permission was denied. You can type every answer.');vi.mocked(app.nova.connectionState).mockReturnValue('ERROR');fixture.detectChanges();
    const editor=(fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#answer')!;expect(editor.disabled).toBe(false);
    app.answer.setValue('Typing remains available');expect(loadDraft()?.answers[0].text).toBe('Typing remains available');app.finishAndClear();fixture.destroy();
  });

  it('shows the fixed interview welcome screen and setup action', async () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your voice.');
    expect(fixture.nativeElement.textContent).toContain("I'm ready to begin");
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.experience-card h3')).map((item) => item.textContent?.trim())).toEqual(['Transition & Adjustment', 'Learning & Curiosity', 'Relationships & Leadership', 'Growth & Aspirations']);
  });

  it('runs the protected synthetic journey without microphone, guest session, persistence or real answers in the request', async () => {
    localStorage.clear(); sessionStorage.clear();
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, userAgent: navigator.userAgent, onLine: true, mediaDevices: { getUserMedia, enumerateDevices: vi.fn() } });
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ url: input, init });
      return input.includes('availability')
        ? { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ open: true, demo: true }) }
        : { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ evaluation: { rubricVersion: 2, categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: 'DEMO only', formattedCopyableText: 'DEMO only' } }) };
    }));
    const fixture = setup(); const app = fixture.componentInstance;
    await app.openSetup(); fixture.detectChanges();
    expect(app.interview.demoMode()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('DEMO: synthetic data only');
    expect(app.form.value).toEqual({ firstName: 'Demo', lastName: 'Student', group: '7A' });
    await app.continueToSoundCheck();
    expect(getUserMedia).not.toHaveBeenCalled();
    await app.testMicrophone();
    expect(getUserMedia).not.toHaveBeenCalled();
    app.start();
    expect(app.interview.stage()).toBe('interview');
    expect(app.nova.prepareInterview).not.toHaveBeenCalled();
    app.interview.updateAnswer('A temporary edit that must not leave this tab');
    for (let index = 1; index < 10; index++) app.interview.move(1);
    expect(app.interview.currentQuestion().id).toBe(10);
    await app.interview.submit();
    expect(app.interview.stage()).toBe('results');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Fixed fictional feedback shows this screen');
    expect(fixture.nativeElement.textContent).not.toContain('Your reflection is built around what you shared');
    expect(requests.map((request) => request.url)).toEqual(['/api/guest/availability', '/api/evaluate']);
    expect(requests[1].init?.body).toBe('{"demo":true}');
    expect(localStorage.getItem('year7-interview-draft-v1')).toBeNull();
    expect(sessionStorage.getItem('year7-interview-result-v1')).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('keeps historic teacher questions and category labels beside their original answers', () => {
    const app = setup().componentInstance;
    const oldRecord = { id: 'old', runId: 'test', studentName: 'Synthetic Student', tutorGroup: '7A', completedAt: '2026-11-15', answers: [{ questionId: 2, text: 'My old answer' }], evaluation: { categories: [], whatWentWell: [], evenBetterIf: '', overallSummary: '', formattedCopyableText: '' } };
    expect(app.recordQuestionText(oldRecord, 2)).toBe('What helps you stay organised during the school day?');
    expect(app.categoryTitle('subjects', undefined)).toBe('Favourite Subjects');
    expect(app.categoryTitle('learning', 2)).toBe('Learning & Curiosity');
  });

  it('shows the privacy notice only 1500ms after a successful Step 1 transition', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ open: true }) }));
    mockDialog();
    const fixture = setup(); const app = fixture.componentInstance;
    fixture.detectChanges();
    await app.openSetup(); fixture.detectChanges();
    expect(app.interview.stage()).toBe('setup');
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    await vi.advanceTimersByTimeAsync(1499); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    await vi.advanceTimersByTimeAsync(1); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('dialog')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('dialog')?.open).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('dialog')).toHaveLength(1);
    fixture.destroy();
  });

  it('does not show the notice when the run is closed or availability fails', async () => {
    vi.useFakeTimers();
    const response = vi.fn().mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ open: false }) }).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', response);
    const fixture = setup(); const app = fixture.componentInstance;
    await app.openSetup();
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.interview.stage()).toBe('welcome'); expect(app.privacyNoticeOpen()).toBe(false);
    await app.openSetup();
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.interview.stage()).toBe('welcome'); expect(app.privacyNoticeOpen()).toBe(false);
    fixture.destroy();
  });

  it('cancels the notice timer when leaving setup and allows deliberate reopening', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ open: true }) }));
    const fixture = setup(); const app = fixture.componentInstance;
    await app.openSetup(); app.backToWelcome();
    await vi.advanceTimersByTimeAsync(1500);
    expect(app.privacyNoticeOpen()).toBe(false);
    app.interview.stage.set('setup'); app.reopenPrivacyNotice();
    expect(app.privacyNoticeOpen()).toBe(true);
    app.closePrivacyNotice();
    expect(app.privacyNoticeOpen()).toBe(false);
    fixture.destroy();
  });

  it('cancels the pending notice on pagehide and component teardown', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ open: true }) }));
    const fixture = setup(); const app = fixture.componentInstance;
    await app.openSetup();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.privacyNoticeOpen()).toBe(false);
    app.backToWelcome();
    await app.openSetup();
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.privacyNoticeOpen()).toBe(false);
  });

  it('uses Nova-3 for the normal interview without a query flag', () => {
    const fixture = setup();
    expect(fixture.componentInstance.speech).toBe(fixture.componentInstance.nova);
    expect(fixture.componentInstance.useNova3).toBe(true);
  });

  it('prepares Nova capture at Begin Interview', () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.form.setValue({ firstName: 'Synthetic', lastName: 'Student', group: '7A' });
    app.interview.stage.set('sound-check');
    app.start();
    expect(app.nova.prepareInterview).toHaveBeenCalledOnce();
    expect(app.interview.stage()).toBe('interview');
    app.finishAndClear();
  });

  it('shows separate first and last names plus the form group and sends the combined name', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.interview.stage.set('setup'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('label[for="first-name"]')?.textContent).toContain('First name');
    expect(root.querySelector('label[for="last-name"]')?.textContent).toContain('Last name');
    expect(root.querySelector('label[for="group"]')?.textContent).toContain('Form group');
    expect(root.querySelector('#first-name')?.getAttribute('autocomplete')).toBe('given-name');
    expect(root.querySelector('#last-name')?.getAttribute('autocomplete')).toBe('family-name');
    app.form.setValue({ firstName: '  Synthetic ', lastName: ' Student  ', group: '7A' });
    app.interview.stage.set('sound-check'); app.start();
    expect(app.interview.name()).toBe('Synthetic Student');
    expect(app.interview.group()).toBe('7A');
    app.finishAndClear();
  });

  it('requires both nonblank name fields before sound check', async () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.interview.stage.set('setup');
    app.form.setValue({ firstName: 'Synthetic', lastName: '   ', group: '7A' });
    await app.continueToSoundCheck();
    expect(app.interview.stage()).toBe('setup');
    expect(app.form.controls.lastName.invalid).toBe(true);
    app.form.controls.lastName.setValue('Student');
    expect(app.form.valid).toBe(true);
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

  it('finalises active speech before opening teacher login and keeps the confirmed draft', async () => {
    history.replaceState({}, '', '/');
    const fixture = setup(); const app = fixture.componentInstance;
    startSyntheticInterview(app);
    vi.mocked(app.nova.isListening).mockReturnValue(true);
    let finish!: (success: boolean) => void;
    vi.mocked(app.nova.stopRecognition).mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const navigation = app.openAdmin();
    expect(app.admin()).toBe(false);
    expect(app.nova.cancelRecognition).not.toHaveBeenCalled();
    finish(true); await navigation;
    expect(app.admin()).toBe(true);
    expect(app.nova.cancelRecognition).toHaveBeenCalledOnce();
    expect(app.interview.currentAnswer()).toBe('My confirmed answer');
    expect(loadDraft()?.answers[0].text).toBe('My confirmed answer');
    app.finishAndClear(); fixture.destroy(); history.replaceState({}, '', '/');
  });

  it('blocks teacher navigation on failed finalisation, releases speech, and explains draft recovery', async () => {
    history.replaceState({}, '', '/');
    const fixture = setup(); const app = fixture.componentInstance;
    startSyntheticInterview(app);
    vi.mocked(app.nova.isListening).mockReturnValue(true);
    vi.mocked(app.nova.stopRecognition).mockResolvedValueOnce(false);
    await app.openAdmin(); fixture.detectChanges();
    expect(app.admin()).toBe(false);
    expect(location.pathname).toBe('/');
    expect(app.nova.cancelRecognition).toHaveBeenCalledOnce();
    expect(app.routeMessage()).toContain('Repeat the missing words or type them');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('saved answers');
    expect(app.interview.currentAnswer()).toBe('My confirmed answer');
    expect(loadDraft()?.answers[0].text).toBe('My confirmed answer');
    app.finishAndClear(); fixture.destroy();
  });

  it('releases a preconnected idle microphone and socket before teacher login', async () => {
    history.replaceState({}, '', '/');
    const fixture = setup(); const app = fixture.componentInstance;
    startSyntheticInterview(app);
    vi.mocked(app.nova.connectionState).mockReturnValue('READY');
    await app.openAdmin();
    expect(app.nova.stopRecognition).not.toHaveBeenCalled();
    expect(app.nova.cancelRecognition).toHaveBeenCalledOnce();
    expect(app.admin()).toBe(true);
    expect(app.interview.currentAnswer()).toBe('My confirmed answer');
    app.finishAndClear(); fixture.destroy(); history.replaceState({}, '', '/');
  });

  it('waits for an already finalising answer even after local capture has stopped', async () => {
    history.replaceState({}, '', '/');
    const fixture = setup(); const app = fixture.componentInstance;
    startSyntheticInterview(app);
    vi.mocked(app.nova.connectionState).mockReturnValue('FINALISING');
    let finish!: (success: boolean) => void;
    vi.mocked(app.nova.stopRecognition).mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const navigation = app.openAdmin();
    expect(app.admin()).toBe(false);
    expect(app.nova.cancelRecognition).not.toHaveBeenCalled();
    finish(true); await navigation;
    expect(app.admin()).toBe(true);
    expect(app.nova.cancelRecognition).toHaveBeenCalledOnce();
    expect(app.interview.currentAnswer()).toBe('My confirmed answer');
    app.finishAndClear(); fixture.destroy(); history.replaceState({}, '', '/');
  });

  it('cleans up on browser back and forward before changing the protected view', async () => {
    history.replaceState({}, '', '/');
    const fixture = setup(); const app = fixture.componentInstance;
    startSyntheticInterview(app);
    vi.mocked(app.nova.isListening).mockReturnValue(true);
    let finish!: (success: boolean) => void;
    vi.mocked(app.nova.stopRecognition).mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    history.replaceState({}, '', '/admin'); window.dispatchEvent(new PopStateEvent('popstate'));
    expect(app.admin()).toBe(false);
    finish(true);
    await vi.waitFor(() => expect(app.admin()).toBe(true));
    expect(app.nova.cancelRecognition).toHaveBeenCalledOnce();
    vi.mocked(app.nova.isListening).mockReturnValue(false);
    history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(app.admin()).toBe(false));
    expect(app.nova.cancelRecognition).toHaveBeenCalledTimes(2);
    expect(app.interview.currentAnswer()).toBe('My confirmed answer');
    app.finishAndClear(); fixture.destroy();
  });

  it('restores the student URL when browser history reaches teacher login after failed speech', async () => {
    history.replaceState({}, '', '/');
    const fixture = setup(); const app = fixture.componentInstance;
    startSyntheticInterview(app);
    vi.mocked(app.nova.isListening).mockReturnValue(true);
    vi.mocked(app.nova.stopRecognition).mockResolvedValueOnce(false);
    history.replaceState({}, '', '/admin'); window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(location.pathname).toBe('/'));
    expect(app.admin()).toBe(false);
    expect(app.nova.cancelRecognition).toHaveBeenCalledOnce();
    expect(app.routeMessage()).toContain('could not be confirmed');
    expect(loadDraft()?.answers[0].text).toBe('My confirmed answer');
    app.finishAndClear(); fixture.destroy();
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
    app.form.setValue({ firstName: 'Test', lastName: 'Student', group: '7A' });
    app.otherGroup.setValue('7G'); app.routeMessage.set('Recovery message');
    app.interview.name.set('Test Student');
    app.interview.group.set('7A');
    app.interview.stage.set('results');
    app.finishAndClear();
    expect(app.interview.stage()).toBe('welcome');
    expect(app.form.value).toEqual({ firstName: '', lastName: '', group: '' });
    expect(app.otherGroup.value).toBe(''); expect(app.routeMessage()).toBe('');
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
