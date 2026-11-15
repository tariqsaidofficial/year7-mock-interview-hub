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
import { VoiceOrbComponent } from './voice-orb/voice-orb.component';
@Component({ selector: 'app-root', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReactiveFormsModule, UiIconComponent, SpeechLabComponent, VoiceOrbComponent], templateUrl: './app.html', styleUrls: ['./app.css', './student-v5.css'] })
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
  readonly otherGroup = new FormControl('', { nonNullable: true });
  readonly groupError = signal('');
  readonly soundCheckStatus = signal('Microphone not checked yet. You can type every answer.');
  readonly soundCheckLevel = signal(0);
  readonly soundCheckActive = signal(false);
  private soundCheckStream: MediaStream | null = null;
  private soundCheckContext: AudioContext | null = null;
  private soundCheckFrame = 0;
  private soundCheckGeneration = 0;
  readonly microphoneTestText = signal('');
  readonly navigationBusy = signal(false);
  readonly adminPassword = new FormControl('', { nonNullable: true });
  readonly search = new FormControl('', { nonNullable: true });
  readonly sort = new FormControl('time', { nonNullable: true });
  readonly sortValue = toSignal(this.sort.valueChanges, { initialValue: 'time' });
  readonly pendingCount = signal(0);
  readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly admin = signal(typeof window !== 'undefined' && location.pathname === '/admin');
  readonly adminMessage = signal(''); readonly records = signal<CompletedRecord[]>([]); readonly selected = signal<CompletedRecord | null>(null); readonly runId = signal(''); readonly loading = signal(false); readonly signedIn = signal(false); readonly signingIn = signal(false);
  readonly availabilityMessage = signal(''); readonly checkingAvailability = signal(false);
  readonly visibleRecords = computed(() => { const term = this.searchValue().toLowerCase().trim(); return this.records().filter((r) => `${r.studentName} ${r.tutorGroup}`.toLowerCase().includes(term)).sort((a, b) => this.sortValue() === 'name' ? a.studentName.localeCompare(b.studentName) : this.sortValue() === 'group' ? a.tutorGroup.localeCompare(b.tutorGroup) : b.completedAt.localeCompare(a.completedAt)); });
  private recognitionBase = '';
  private speechGeneration = 0;
  constructor() {
    this.answer.valueChanges.subscribe((text) => { if (this.speech.isListening() || this.nova.isCapturePending()) { this.speechGeneration++; void this.speech.stopRecognition(); } else if (this.nova.connectionState() === 'ERROR') this.nova.cancelRecognition(); this.interview.updateAnswer(text); });
    if (this.admin()) void this.checkSession();
    window.addEventListener('popstate', () => { this.stopSoundCheck(); if (this.speechLab) this.nova.cancelRecognition(); this.admin.set(location.pathname === '/admin'); if (this.admin()) void this.checkSession(); });
    window.addEventListener('pagehide', () => { this.stopSoundCheck(); this.nova.cancelRecognition(); });
    document.addEventListener('visibilitychange', () => {
      // Safari briefly hides the document while its microphone permission sheet is open.
      // Keep a pending permission request valid; an active stream is still closed on tab hide.
      if (document.hidden && this.interview.stage() === 'sound-check' && this.soundCheckStream) {
        this.stopSoundCheck();
        this.soundCheckStatus.set('Microphone switched off when you left the page. Tap to test it again.');
      }
    });
  }
  private syncAnswer() { this.answer.setValue(this.interview.currentAnswer(), { emitEvent: false }); }
  openAdmin() { this.stopSoundCheck(); if (this.speechLab) this.nova.cancelRecognition(); history.pushState({}, '', '/admin'); this.adminMessage.set(''); this.admin.set(true); void this.checkSession(); }
  closeAdmin() { if (this.speechLab) this.nova.cancelRecognition(); history.pushState({}, '', '/'); this.admin.set(false); this.adminMessage.set(''); this.adminPassword.setValue(''); this.records.set([]); this.selected.set(null); }
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
  async continueToSoundCheck() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.form.controls.group.value === 'Other' && !/^[A-Za-z0-9 -]{2,30}$/.test(this.otherGroup.value.trim())) { this.groupError.set('Enter a tutor group using 2–30 letters, numbers, spaces or hyphens.'); return; }
    this.groupError.set('');
    this.interview.stage.set('sound-check');
    await this.startSoundCheck();
  }
  start() {
    if (this.form.invalid || (this.form.controls.group.value === 'Other' && !!this.groupError())) { this.form.markAllAsTouched(); return; }
    if (this.useNova3) this.nova.cancelRecognition();
    const preparedStream = this.stopSoundCheck(true);
    this.interview.start(this.form.controls.name.value, this.form.controls.group.value === 'Other' ? this.otherGroup.value : this.form.controls.group.value);
    this.syncAnswer();
    if (this.interview.stage() === 'interview') { this.nova.inputDeviceId = this.microphone.value; this.nova.prepareInterview(preparedStream); }
    else preparedStream?.getTracks().forEach((track) => track.stop());
  }
  async startSoundCheck() {
    this.stopSoundCheck();
    const generation = this.soundCheckGeneration;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) { this.soundCheckStatus.set('Microphone access is unavailable here. You can type every answer.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, ...(this.microphone.value ? { deviceId: { exact: this.microphone.value } } : {}) }, video: false });
      if (generation !== this.soundCheckGeneration || document.hidden || this.interview.stage() !== 'sound-check') { stream.getTracks().forEach((track) => track.stop()); return; }
      this.soundCheckStream = stream;
      const context = new AudioContext(); this.soundCheckContext = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let lastFrame = 0;
      const update = (time: number) => {
        if (!this.soundCheckStream) return;
        if (time - lastFrame >= 45 && !document.hidden) {
          lastFrame = time;
          analyser.getFloatTimeDomainData(samples);
          let sum = 0; for (const sample of samples) sum += sample * sample;
          this.soundCheckLevel.set(Math.min(1, Math.sqrt(sum / samples.length) * 8));
        }
        this.soundCheckFrame = requestAnimationFrame(update);
      };
      update(0); this.soundCheckActive.set(true);
      this.soundCheckStatus.set('Microphone is ready. Speak to see the ring respond. Your test audio is not saved.');
      const track = stream.getAudioTracks()[0];
      this.nova.selectedInputName.set(track?.label || 'Browser default');
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (generation === this.soundCheckGeneration) this.nova.availableMicrophones.set(devices.filter((item) => item.kind === 'audioinput').map((item) => ({ id: item.deviceId, label: item.label || 'Microphone' })));
      } catch { /* The selected microphone remains usable without device enumeration. */ }
    } catch { if (generation === this.soundCheckGeneration) { this.stopSoundCheck(); this.soundCheckStatus.set('Microphone permission was not granted. You can retry or type every answer.'); } }
  }
  stopSoundCheck(keepStream = false): MediaStream | null {
    this.soundCheckGeneration++;
    if (this.soundCheckFrame) cancelAnimationFrame(this.soundCheckFrame);
    this.soundCheckFrame = 0;
    const stream = keepStream ? this.soundCheckStream : null;
    if (!keepStream) this.soundCheckStream?.getTracks().forEach((track) => track.stop());
    this.soundCheckStream = null;
    void this.soundCheckContext?.close().catch(() => undefined); this.soundCheckContext = null;
    this.soundCheckActive.set(false); this.soundCheckLevel.set(0);
    return stream;
  }
  resume() { this.interview.resume(); this.syncAnswer(); if (this.interview.stage() === 'interview') this.nova.prepareInterview(); }
  private clearNovaDisplay() { if (this.useNova3) { this.nova.confirmed.set(''); this.nova.provisional.set(''); } }
  async move(delta: number) { if (this.navigationBusy()) return; this.navigationBusy.set(true); try { if (await this.speech.stopRecognition() === false) return; this.speechGeneration++; this.interview.move(delta); this.syncAnswer(); this.clearNovaDisplay(); } finally { this.navigationBusy.set(false); } }
  async next() { if (this.navigationBusy()) return; this.navigationBusy.set(true); try { if (await this.speech.stopRecognition() === false) return; this.speechGeneration++; if (this.interview.index() === this.questions.length - 1) await this.interview.submit(); else this.interview.move(1); this.syncAnswer(); this.clearNovaDisplay(); } finally { this.navigationBusy.set(false); } }
  private resetStudentSession() {
    this.stopSoundCheck();
    this.speechGeneration++;
    if (this.useNova3) this.nova.cancelRecognition();
    this.interview.clear();
    this.form.reset({ name: '', group: '' });
    this.answer.setValue('', { emitEvent: false });
    this.microphone.reset('');
    this.microphoneTestText.set('');
    this.availabilityMessage.set('');
    this.clearNovaDisplay();
  }
  clearDraft() { if (confirm('Clear your saved interview draft and answers from this device?')) this.resetStudentSession(); }
  finishAndClear() { this.resetStudentSession(); }
  async replayQuestion() { if (this.navigationBusy()) return; this.navigationBusy.set(true); try { if (await this.speech.stopRecognition() === false) return; this.speechGeneration++; this.audio.replay(this.interview.currentQuestion().id); } finally { this.navigationBusy.set(false); } }
  async inspectMicrophones() { if (!this.useNova3) return; try { const devices = await navigator.mediaDevices.enumerateDevices(); this.nova.availableMicrophones.set(devices.filter((item) => item.kind === 'audioinput').map((item) => ({ id: item.deviceId, label: item.label || 'Microphone' }))); } catch { this.soundCheckStatus.set('Input devices could not be checked. Browser default and typing remain available.'); } }
  testQuestionAudio() { if (this.useNova3) this.nova.cancelRecognition(); this.audio.test(); }
  async testMicrophone() {
    if (this.useNova3) {
      if (this.soundCheckActive()) { this.stopSoundCheck(); this.soundCheckStatus.set('Microphone test stopped. You can retry or type every answer.'); return; }
      await this.startSoundCheck();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { this.speech.status.set('Microphone unavailable. You can type your answers.'); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); this.speech.status.set('Microphone access is allowed. Speech recognition may mishear words; check and edit your answer.'); }
    catch { this.speech.status.set('Microphone permission denied. You can type your answers.'); }
  }
  async toggleMic() {
    if (this.navigationBusy()) return;
    if (this.speech.isListening() || this.nova.isCapturePending()) { this.navigationBusy.set(true); try { await this.speech.stopRecognition(); } finally { this.navigationBusy.set(false); } return; }
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
    if (this.signingIn()) return;
    this.signingIn.set(true);
    this.adminMessage.set('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Year7Interview' }, body: JSON.stringify({ password: this.adminPassword.value }) });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign-in service returned an unexpected page.');
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Sign-in did not finish.');
      this.signedIn.set(true); await this.refresh();
    } catch (error) { this.adminMessage.set(error instanceof TypeError ? 'The sign-in service is unavailable. Check your connection and try again.' : error instanceof Error ? error.message : 'Sign-in did not finish. Please try again.'); }
    finally { this.adminPassword.setValue(''); this.signingIn.set(false); }
  }
  async signOutTeacher() {
    try { const csrf = await adminCsrf(); const response = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } }); if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !(await response.json() as { signedOut?: boolean }).signedOut) throw new Error('Sign-out failed'); }
    catch { this.adminMessage.set('Could not sign out on the server. Please try again.'); return; }
    this.signedIn.set(false); this.records.set([]); this.selected.set(null);
  }
  async refresh() {
    this.loading.set(true); this.adminMessage.set('');
    try {
      const all: CompletedRecord[] = []; let pending = 0; let cursor: string | null = null; let activeRun = '';
      const seen = new Set<string>();
      do {
        const response = await fetch(`/api/admin/records${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { credentials: 'same-origin' });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Records service returned an unexpected page.');
        const data = await response.json() as { error?: string; runId: string; records: CompletedRecord[]; pendingCount: number; nextCursor: string | null };
        if (!response.ok) throw new Error(data.error || 'Records unavailable.');
        if (activeRun && data.runId !== activeRun) throw new Error('The classroom run changed. Please refresh.');
        activeRun = data.runId; all.push(...data.records); pending += data.pendingCount || 0;
        cursor = data.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error('Records paging was interrupted. Please refresh.');
        if (cursor) seen.add(cursor);
      } while (cursor);
      this.runId.set(activeRun); this.records.set(all); this.pendingCount.set(pending);
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
