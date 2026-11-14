import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Answer, Evaluation, QUESTIONS } from './interview.models';
import { clearDraft, Draft, loadDraft, saveDraft } from './draft';
import { clearResult, loadResult, saveResult } from './result-store';
import { guestCsrf } from './session';
import { Nova3SpeechService } from './experiments/nova3-speech.service';
import { QuestionAudioService } from './question-audio.service';
export type Stage = 'welcome' | 'setup' | 'sound-check' | 'resume-draft' | 'interview' | 'evaluating' | 'offline-pending' | 'evaluation-error' | 'results';
const RECOMMENDED_SECONDS = 8 * 60;
export const STUDENT_CSRF = new InjectionToken<() => Promise<string>>('guest session csrf', { providedIn: 'root', factory: () => guestCsrf });
@Injectable({ providedIn: 'root' })
export class InterviewService {
  readonly questions = QUESTIONS;
  readonly stage = signal<Stage>('welcome');
  readonly name = signal(''); readonly group = signal('');
  readonly index = signal(0);
  readonly answers = signal<Answer[]>(QUESTIONS.map((q) => ({ questionId: q.id, text: '' })));
  readonly startedAt = signal(0);
  readonly elapsedSeconds = signal(0);
  readonly pastGuide = computed(() => this.elapsedSeconds() >= RECOMMENDED_SECONDS);
  readonly remainingSeconds = computed(() => Math.max(0, RECOMMENDED_SECONDS - this.elapsedSeconds()));
  readonly nearGuide = computed(() => this.remainingSeconds() <= 30);
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly evaluation = signal<Evaluation | null>(null);
  readonly message = signal('');
  readonly copyMessage = signal('');
  readonly savedOnDevice = signal(true);
  readonly resultSaved = signal(true);
  readonly currentQuestion = computed(() => QUESTIONS[this.index()]);
  readonly currentAnswer = computed(() => this.answers()[this.index()]?.text || '');
  readonly timeText = computed(() => { const s = this.remainingSeconds(); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; });
  private id = '';
  private tickHandle: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private speech = inject(Nova3SpeechService);
  private audio = inject(QuestionAudioService);
  private csrfForSubmission = inject(STUDENT_CSRF);
  constructor() {
    if (typeof window === 'undefined') return;
    const draft = loadDraft();
    if (draft) {
      this.restore(draft);
      const recovered = loadResult(draft.id);
      if (recovered) { this.evaluation.set(recovered); this.stage.set('results'); }
      else this.stage.set('resume-draft');
    } else clearResult();
    window.addEventListener('online', () => { this.online.set(true); if (this.stage() === 'offline-pending') void this.submit(); });
    window.addEventListener('offline', () => { this.online.set(false); this.speech.stopRecognition(); });
    document.addEventListener('visibilitychange', () => this.tick());
  }
  showSetup() { this.stage.set('setup'); }
  start(name: string, group: string) {
    if (this.stage() !== 'sound-check') return;
    clearResult(); this.resultSaved.set(true);
    this.name.set(name.trim()); this.group.set(group.trim());
    this.id = crypto.randomUUID(); this.startedAt.set(Date.now()); this.elapsedSeconds.set(0);
    this.index.set(0); this.answers.set(QUESTIONS.map((q) => ({ questionId: q.id, text: '' })));
    this.stage.set('interview'); this.save(); this.startTicker(); this.audio.enterQuestion(QUESTIONS[0].id);
  }
  resume() {
    if (this.stage() !== 'resume-draft') return;
    this.stage.set('interview'); this.startTicker();
    this.audio.enterQuestion(this.currentQuestion().id);
  }
  private restore(draft: Draft) {
    this.id = draft.id; this.name.set(draft.name); this.group.set(draft.group);
    this.answers.set(QUESTIONS.map((q) => ({ questionId: q.id, text: draft.answers.find((a) => a.questionId === q.id)?.text || '' })));
    this.index.set(draft.index); this.startedAt.set(draft.startedAt); this.tick();
  }
  private save() {
    if (!this.id) return;
    this.savedOnDevice.set(saveDraft({ version: 2, id: this.id, name: this.name(), group: this.group(), answers: this.answers(), index: this.index(), startedAt: this.startedAt(), updatedAt: Date.now() }));
    if (!this.savedOnDevice()) this.message.set('This device could not save your draft. Copy your answers before leaving.');
  }
  private startTicker() { clearInterval(this.tickHandle); this.tick(); this.tickHandle = setInterval(() => this.tick(), 500); }
  private tick() {
    if (!this.startedAt()) return;
    this.elapsedSeconds.set(Math.max(0, Math.floor((Date.now() - this.startedAt()) / 1000)));
  }
  updateAnswer(text: string) {
    if (this.stage() !== 'interview') return;
    this.answers.update((all) => all.map((a, i) => i === this.index() ? { ...a, text: text.slice(0, 1200) } : a)); this.save();
  }
  move(delta: number) {
    if (this.busy || this.stage() !== 'interview') return;
    const next = this.index() + delta;
    if (next < 0 || next >= QUESTIONS.length) return;
    this.speech.stopRecognition(); this.audio.stop(); this.index.set(next); this.save(); this.tick();
    this.audio.enterQuestion(this.currentQuestion().id);
  }
  next() { if (this.stage() !== 'interview') return; if (this.index() === 9) void this.submit(); else this.move(1); }
  async submit() {
    if (this.busy || !['interview', 'offline-pending', 'evaluation-error'].includes(this.stage())) return;
    this.speech.stopRecognition(); this.audio.stop(); clearInterval(this.tickHandle); this.save();
    if (!navigator.onLine) { this.stage.set('offline-pending'); this.message.set(this.savedOnDevice() ? 'Saved on this device. Feedback will be available when you are online.' : 'This device could not save your draft. Copy your answers before leaving.'); return; }
    this.busy = true; this.stage.set('evaluating'); this.message.set('');
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => { timeoutHandle = setTimeout(() => { controller.abort(); reject(new Error('Feedback is taking longer than expected. Your answers are still here; please try again.')); }, 70_000); });
      const request = async (): Promise<Evaluation> => {
        const csrf = await this.csrfForSubmission();
        if (controller.signal.aborted) throw new Error('Feedback is taking longer than expected. Your answers are still here; please try again.');
        const response = await fetch('/api/evaluate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ requestId: this.id, studentName: this.name(), tutorGroup: this.group(), answers: this.answers() }), signal: controller.signal });
        if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('The feedback service returned an unexpected page. Your answers are still here; please try again later.');
        let data: { evaluation?: Evaluation; error?: string };
        try { data = await response.json() as { evaluation?: Evaluation; error?: string }; }
        catch { throw new Error('The feedback service sent an unreadable reply. Your answers are still here; please try again later.'); }
        if (!response.ok || !data?.evaluation) throw new Error(data?.error || 'Feedback is unavailable right now. Please try again.');
        return data.evaluation;
      };
      const evaluation = await Promise.race([request(), deadline]);
      this.evaluation.set(evaluation);
      this.resultSaved.set(saveResult(this.id, evaluation));
      this.stage.set('results');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Feedback is unavailable right now.');
      this.stage.set(navigator.onLine ? 'evaluation-error' : 'offline-pending');
    } finally { clearTimeout(timeoutHandle); this.busy = false; }
  }
  async copyFeedback() {
    const text = this.evaluation()?.formattedCopyableText;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); this.copyMessage.set('Feedback copied.'); }
    catch { this.copyMessage.set('Copy did not work. Select the feedback text below to copy it.'); }
  }
  async copyAnswers() {
    const text = this.answers().map((a, i) => `Q${a.questionId}: ${QUESTIONS[i].text}\n${a.text || '(No answer)'}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); this.copyMessage.set('Answers copied.'); }
    catch { this.copyMessage.set('Copy did not work. Select the answers below to copy them.'); }
  }
  clear() {
    this.speech.stopRecognition(); this.audio.reset(); clearInterval(this.tickHandle); clearDraft(); clearResult();
    this.id = ''; this.name.set(''); this.group.set(''); this.answers.set(QUESTIONS.map((q) => ({ questionId: q.id, text: '' })));
    this.startedAt.set(0); this.elapsedSeconds.set(0); this.evaluation.set(null); this.message.set(''); this.copyMessage.set(''); this.resultSaved.set(true); this.stage.set('welcome');
  }
}
