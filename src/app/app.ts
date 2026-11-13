import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CATEGORIES, CategoryId, CompletedRecord, QUESTIONS } from './interview.models';
import { InterviewService } from './interview.service';
import { SpeechService } from './speech.service';
import { adminCsrf } from './session';
import { QuestionAudioService } from './question-audio.service';
import { UiIconComponent, IconName } from './ui-icon.component';
import { SpeechLabComponent } from './experiments/speech-lab.component';
import { Nova3SpeechService } from './experiments/nova3-speech.service';
@Component({ selector: 'app-root', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReactiveFormsModule, UiIconComponent, SpeechLabComponent], templateUrl: './app.html', styleUrl: './app.css' })
export class App {
  readonly speechLab = isDevMode() && typeof location !== 'undefined' && new URLSearchParams(location.search).has('speech-lab');
  readonly useNova3 = true;
  readonly interview = inject(InterviewService);
  readonly speech = this.useNova3 ? inject(Nova3SpeechService) : inject(SpeechService);
  readonly nova = inject(Nova3SpeechService);
  readonly audio = inject(QuestionAudioService);
  readonly questions = QUESTIONS;
  categoryTitle(id: CategoryId) { return CATEGORIES.find((c) => c.id === id)?.title || id; }
  categoryIcon(id: CategoryId): IconName { return ({ transition: 'transition', subjects: 'book', activities: 'activity', leadership: 'leadership' } as const)[id]; }
  readonly categories = CATEGORIES;
  readonly answersText = computed(() => this.interview.answers().map((item) => `Q${item.questionId}: ${item.text || '(No answer)'}`).join('\n\n'));
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)] }), group: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(30)] }) });
  readonly answer = new FormControl('', { nonNullable: true });
  readonly microphone = new FormControl('', { nonNullable: true });
  readonly microphoneTestText = signal('');
  readonly navigationBusy = signal(false);
  readonly adminPassword = new FormControl('', { nonNullable: true });
  readonly search = new FormControl('', { nonNullable: true });
  readonly sort = new FormControl('time', { nonNullable: true });
  readonly sortValue = toSignal(this.sort.valueChanges, { initialValue: 'time' });
  readonly pendingCount = signal(0);
  readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly admin = signal(typeof window !== 'undefined' && location.pathname === '/admin');
  readonly adminMessage = signal(''); readonly records = signal<CompletedRecord[]>([]); readonly selected = signal<CompletedRecord | null>(null); readonly runId = signal(''); readonly loading = signal(false); readonly signedIn = signal(false);
  readonly availabilityMessage = signal(''); readonly checkingAvailability = signal(false);
  readonly visibleRecords = computed(() => { const term = this.searchValue().toLowerCase().trim(); return this.records().filter((r) => `${r.studentName} ${r.tutorGroup}`.toLowerCase().includes(term)).sort((a, b) => this.sortValue() === 'name' ? a.studentName.localeCompare(b.studentName) : this.sortValue() === 'group' ? a.tutorGroup.localeCompare(b.tutorGroup) : b.completedAt.localeCompare(a.completedAt)); });
  private recognitionBase = '';
  private speechGeneration = 0;
  constructor() {
    this.answer.valueChanges.subscribe((text) => { if (this.speech.isListening()) { this.speechGeneration++; if (this.useNova3) (this.speech as Nova3SpeechService).cancelRecognition(); else void this.speech.stopRecognition(); } this.interview.updateAnswer(text); });
    if (this.admin()) void this.checkSession();
    window.addEventListener('popstate', () => { if (this.speechLab) this.nova.cancelRecognition(); this.admin.set(location.pathname === '/admin'); if (this.admin()) void this.checkSession(); });
  }
  private syncAnswer() { this.answer.setValue(this.interview.currentAnswer(), { emitEvent: false }); }
  openAdmin() { if (this.speechLab) this.nova.cancelRecognition(); history.pushState({}, '', '/admin'); this.admin.set(true); void this.checkSession(); }
  closeAdmin() { if (this.speechLab) this.nova.cancelRecognition(); history.pushState({}, '', '/'); this.admin.set(false); this.adminPassword.setValue(''); this.records.set([]); this.selected.set(null); }
  async openSetup() {
    if (this.checkingAvailability()) return;
    this.checkingAvailability.set(true); this.availabilityMessage.set('');
    try {
      const response = await fetch('/api/guest/availability', { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('The classroom status could not be checked. Please try again.');
      const data = await response.json() as { open?: boolean };
      if (data.open !== true) { this.availabilityMessage.set('This classroom run is not open yet. Please ask your teacher before starting.'); return; }
      this.interview.showSetup();
    } catch { this.availabilityMessage.set('The classroom status could not be checked. Please connect and try again.'); }
    finally { this.checkingAvailability.set(false); }
  }
  start() { if (this.form.invalid) { this.form.markAllAsTouched(); return; } if (this.useNova3) this.nova.cancelRecognition(); this.interview.start(this.form.controls.name.value, this.form.controls.group.value); this.syncAnswer(); }
  resume() { this.interview.resume(); this.syncAnswer(); }
  private clearNovaDisplay() { if (this.useNova3) { this.nova.confirmed.set(''); this.nova.provisional.set(''); } }
  async move(delta: number) { if (this.navigationBusy()) return; this.navigationBusy.set(true); try { await this.speech.stopRecognition(); this.speechGeneration++; this.interview.move(delta); this.syncAnswer(); this.clearNovaDisplay(); } finally { this.navigationBusy.set(false); } }
  async next() { if (this.navigationBusy()) return; this.navigationBusy.set(true); try { await this.speech.stopRecognition(); this.speechGeneration++; this.interview.next(); this.syncAnswer(); this.clearNovaDisplay(); } finally { this.navigationBusy.set(false); } }
  clearDraft() { if (confirm('Clear your saved interview draft and answers from this device?')) { this.speechGeneration++; if (this.useNova3) this.nova.cancelRecognition(); this.interview.clear(); this.answer.setValue('', { emitEvent: false }); this.clearNovaDisplay(); } }
  async replayQuestion() { if (this.navigationBusy()) return; this.navigationBusy.set(true); try { await this.speech.stopRecognition(); this.speechGeneration++; this.audio.replay(this.interview.currentQuestion().id); } finally { this.navigationBusy.set(false); } }
  async inspectMicrophones() { if (!this.useNova3) return; try { await this.nova.inspectMicrophones(); } catch { this.speech.status.set('Microphone devices could not be checked. You can type your answers.'); } }
  testQuestionAudio() { if (this.useNova3) this.nova.cancelRecognition(); this.audio.test(); }
  async testMicrophone() {
    if (this.useNova3) {
      if (this.nova.isListening()) { await this.nova.stopRecognition(); return; }
      this.microphoneTestText.set(''); this.nova.inputDeviceId = this.microphone.value;
      this.nova.startRecognition(() => this.microphoneTestText.set(this.nova.confirmed()));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { this.speech.status.set('Microphone unavailable. You can type your answers.'); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); this.speech.status.set('Microphone access is allowed. Speech recognition may mishear words; check and edit your answer.'); }
    catch { this.speech.status.set('Microphone permission denied. You can type your answers.'); }
  }
  async toggleMic() {
    if (this.navigationBusy()) return;
    if (this.speech.isListening()) { this.navigationBusy.set(true); try { await this.speech.stopRecognition(); } finally { this.navigationBusy.set(false); } return; }
    this.audio.stop();
    this.recognitionBase = this.answer.value;
    if (this.useNova3) (this.speech as Nova3SpeechService).inputDeviceId = this.microphone.value;
    const generation = ++this.speechGeneration;
    const questionId = this.interview.currentQuestion().id;
    const startedAt = this.interview.startedAt();
    this.speech.startRecognition((transcript) => {
      if (generation !== this.speechGeneration || this.interview.stage() !== 'interview' || this.interview.currentQuestion().id !== questionId || this.interview.startedAt() !== startedAt) return;
      const words = this.useNova3 ? (this.speech as Nova3SpeechService).confirmed() : transcript;
      if (this.useNova3 && !words) return;
      const value = [this.recognitionBase.trim(), words.trim()].filter(Boolean).join(' ');
      this.answer.setValue(value, { emitEvent: false }); this.interview.updateAnswer(value);
    });
  }
  private async checkSession() {
    try { await adminCsrf(); this.signedIn.set(true); await this.refresh(); }
    catch { this.signedIn.set(false); }
  }
  async signIn() {
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Year7Interview' }, body: JSON.stringify({ password: this.adminPassword.value }) });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign-in service returned an unexpected page.');
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Sign-in did not finish.');
      this.signedIn.set(true); await this.refresh();
    } catch (error) { this.adminMessage.set(error instanceof Error ? error.message : 'Sign-in did not finish. Please try again.'); }
    finally { this.adminPassword.setValue(''); }
  }
  async signOutTeacher() {
    try { const csrf = await adminCsrf(); const response = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } }); if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !(await response.json() as { signedOut?: boolean }).signedOut) throw new Error('Sign-out failed'); }
    catch { this.adminMessage.set('Could not sign out on the server. Please try again.'); return; }
    this.signedIn.set(false); this.records.set([]); this.selected.set(null);
  }
  async refresh() {
    this.loading.set(true); this.adminMessage.set('');
    try {
      const response = await fetch('/api/admin/records', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Records unavailable.');
      this.runId.set(data.runId); this.records.set(data.records); this.pendingCount.set(data.pendingCount || 0);
    } catch (error) { this.adminMessage.set(error instanceof Error ? error.message : 'Records unavailable.'); }
    finally { this.loading.set(false); }
  }
  async clearRecords() {
    if (!this.runId()) return;
    if (!confirm(`Permanently delete all records for session ${this.runId()}? This cannot be undone.`)) return;
    const typed = prompt(`Type ${this.runId()} to confirm permanent deletion:`);
    if (typed !== this.runId()) return;
    try {
      const csrf = await adminCsrf();
      const response = await fetch('/api/admin/clear', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ confirmRunId: this.runId() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not clear records.');
      this.selected.set(null); await this.refresh(); this.adminMessage.set(`${data.deleted} records permanently deleted.`);
    } catch (error) { this.adminMessage.set(error instanceof Error ? error.message : 'Could not clear records.'); }
  }
  async copyRecord() {
    const text = this.selected()?.evaluation.formattedCopyableText;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); this.adminMessage.set('Feedback copied.'); }
    catch { this.adminMessage.set('Select the feedback text below to copy it.'); }
  }
}
