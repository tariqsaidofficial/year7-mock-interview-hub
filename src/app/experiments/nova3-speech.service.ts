import { Injectable, signal } from '@angular/core';
import { guestCsrf } from '../session';
import { NovaResult, NovaTranscript } from './nova3-transcript';

type TranscriptCallback = (text: string, final: boolean) => void;
export type NovaCaptureMode = 'native' | '16k';
export type NovaEndpointing = 'natural' | '300' | '500';

@Injectable({ providedIn: 'root' })
export class Nova3SpeechService {
  readonly status = signal('Stopped');
  readonly recognitionAvailable = signal(typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.AudioContext && !!window.AudioWorkletNode && !!window.WebSocket && window.isSecureContext);
  readonly confirmed = signal('');
  readonly provisional = signal('');
  readonly audioLevel = signal(0);
  readonly firstFinalLatencyMs = signal<number | null>(null);
  readonly firstInterimLatencyMs = signal<number | null>(null);
  readonly connectionReadyMs = signal<number | null>(null);
  readonly connectionDurationMs = signal(0);
  readonly audioSecondsSent = signal(0);
  readonly finalisationDelayMs = signal<number | null>(null);
  readonly trialConnectionCount = signal(0);
  readonly connectionErrors = signal(0);
  readonly finalSegments = signal(0);
  readonly selectedInputName = signal('Not checked');
  readonly actualSampleRate = signal<number | null>(null);
  readonly availableMicrophones = signal<{ id: string; label: string }[]>([]);
  captureMode: NovaCaptureMode = 'native';
  endpointing: NovaEndpointing = 'natural';
  useSunmarkeKeyterm = false;
  boundedTrial = false;
  onTrialHardStop: (() => void) | null = null;
  inputDeviceId = '';
  private generation = 0;
  private running = false;
  private stopping = false;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private workletReady: Promise<void> | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mute: GainNode | null = null;
  private state = new NovaTranscript();
  private callback: TranscriptCallback | null = null;
  private firstAudioAt = 0;
  private startedAt = 0;
  private connectedAt = 0;
  private audioBytes = 0;
  private flushResolve: (() => void) | null = null;
  private closeResolve: (() => void) | null = null;
  private gracefulCloseRequested = false;
  private interruptedDuringStop = false;
  private trialWatchdog: ReturnType<typeof setTimeout> | null = null;
  private trialDeadline = 0;
  private readonly trialStorageKey = 'y7-nova3-live-trial-connections';
  private readonly pageLeave = () => this.cancelRecognition();
  private usageEventId: string | null = null;
  private usageCsrf = '';

  isListening() { return this.running; }
  trialConnectionsUsed() { return this.readTrialCount() ?? 2; }

  async inspectMicrophones() {
    if (!this.recognitionAvailable()) throw new Error('Microphone diagnostics require a secure browser context.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const track = stream.getAudioTracks()[0];
      this.selectedInputName.set(track?.label || 'Browser did not reveal the microphone name');
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableMicrophones.set(devices.filter((item) => item.kind === 'audioinput').map((item) => ({ id: item.deviceId, label: item.label || 'Unnamed microphone' })));
    } finally { stream.getTracks().forEach((track) => track.stop()); }
  }

  startRecognition(onText: TranscriptCallback): boolean {
    if (!this.recognitionAvailable() || !navigator.onLine) { this.status.set('Speech comparison unavailable. You can type instead.'); return false; }
    if (this.running) return false;
    if (this.boundedTrial && (this.readTrialCount() ?? 2) >= 2) { this.status.set('The two-session trial limit has been reached.'); return false; }
    const generation = ++this.generation;
    this.usageEventId = crypto.randomUUID(); this.usageCsrf = '';
    this.running = true; this.stopping = false; this.callback = onText;
    this.state = new NovaTranscript(); this.confirmed.set(''); this.provisional.set('');
    this.firstFinalLatencyMs.set(null); this.firstInterimLatencyMs.set(null); this.connectionReadyMs.set(null); this.connectionDurationMs.set(0); this.audioSecondsSent.set(0); this.finalisationDelayMs.set(null); this.connectionErrors.set(0); this.finalSegments.set(0);
    this.startedAt = Date.now(); this.connectedAt = 0; this.firstAudioAt = 0; this.audioBytes = 0;
    this.gracefulCloseRequested = false; this.interruptedDuringStop = false;
    if (this.boundedTrial) {
      this.trialDeadline = this.startedAt + 90_000;
      this.trialWatchdog = setTimeout(() => {
        if (generation !== this.generation) return;
        this.cancelRecognition();
        this.status.set('Trial stopped automatically at 90 seconds.');
        this.onTrialHardStop?.();
      }, 90_000);
      window.addEventListener('pagehide', this.pageLeave);
    }
    try {
      // Construct and resume during the click gesture for iPad Safari.
      this.context = new AudioContext(this.captureMode === '16k' ? { sampleRate: 16_000 } : undefined);
      this.actualSampleRate.set(this.context.sampleRate);
      this.workletReady = this.context.audioWorklet.addModule('/experiments/nova3-pcm-worklet.js');
      void this.context.resume().catch(() => undefined);
    } catch { this.cancelRecognition(); this.status.set('Audio capture unavailable. You can type instead.'); return false; }
    this.status.set('Connecting to Nova-3…');
    void this.open(generation, 0);
    return true;
  }

  private async token(): Promise<string> {
    const csrf = await guestCsrf();
    this.usageCsrf = csrf;
    const response = await fetch('/api/guest/nova3-token', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf }, signal: AbortSignal.timeout(8_000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Speech service returned an unexpected page.');
    const data = await response.json() as { accessToken?: string; error?: string };
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Speech comparison is unavailable.');
    return data.accessToken;
  }

  private async open(generation: number, reconnect: number) {
    try {
      if (!this.stream) {
        const captured = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, ...(this.inputDeviceId ? { deviceId: { exact: this.inputDeviceId } } : {}) }, video: false });
        if (generation !== this.generation || this.stopping) { captured.getTracks().forEach((track) => track.stop()); return; }
        this.stream = captured;
        this.selectedInputName.set(this.stream.getAudioTracks()[0]?.label || 'Browser did not reveal the microphone name');
      }
      if (generation !== this.generation || this.stopping) return;
      if (!this.context || !this.workletReady) throw new Error('Audio capture unavailable.');
      await this.workletReady;
      await this.context.resume();
      if (generation !== this.generation || this.stopping) return;
      const token = await this.token();
      if (generation !== this.generation || this.stopping) return;
      if (this.boundedTrial && Date.now() >= this.trialDeadline) { this.cancelRecognition(); return; }
      const query = new URLSearchParams({ model: 'nova-3', language: 'en-GB', interim_results: 'true', punctuate: 'true', smart_format: 'true', encoding: 'linear16', sample_rate: String(this.context.sampleRate) });
      if (this.endpointing !== 'natural') query.set('endpointing', this.endpointing);
      if (this.useSunmarkeKeyterm && !this.boundedTrial) query.append('keyterm', 'Sunmarke');
      if (this.boundedTrial) {
        const count = this.readTrialCount();
        if (count === null || count >= 2 || !this.writeTrialCount(count + 1)) throw new Error('The two-session trial limit has been reached.');
      }
      const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, ['bearer', token]);
      this.socket = socket;
      this.state.nextStream();
      socket.onopen = () => {
        if (generation !== this.generation || this.stopping) { socket.close(); return; }
        this.connectedAt = Date.now(); this.connectionReadyMs.set(this.connectedAt - this.startedAt);
        this.status.set(reconnect ? 'Reconnected. Continue speaking.' : 'Listening with Nova-3');
        if (!this.context || !this.stream) return;
        const source = this.context.createMediaStreamSource(this.stream);
        const worklet = new AudioWorkletNode(this.context, 'nova3-pcm');
        const mute = this.context.createGain(); mute.gain.value = 0;
        source.connect(worklet); worklet.connect(mute); mute.connect(this.context.destination);
        this.source = source; this.mute = mute;
        worklet.port.onmessage = (event: MessageEvent<ArrayBuffer | { type: string; id?: number; value?: number }>) => {
          if (generation !== this.generation) return;
          if (!(event.data instanceof ArrayBuffer)) {
            if (event.data?.type === 'level') this.audioLevel.set(Math.min(1, (event.data.value || 0) * 8));
            if (event.data?.type === 'flushed' && event.data.id === generation) this.flushResolve?.();
            return;
          }
          if (socket.readyState !== WebSocket.OPEN) return;
          this.firstAudioAt ||= Date.now();
          this.audioBytes += event.data.byteLength;
          this.audioSecondsSent.set(this.audioBytes / (2 * (this.context?.sampleRate || 1)));
          socket.send(event.data);
        };
        this.worklet = worklet;
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        if (generation !== this.generation) return;
        let result: NovaResult;
        try { result = JSON.parse(event.data) as NovaResult; } catch { return; }
        if (this.state.receive(result)) {
          if (result.is_final === false && this.firstAudioAt && this.firstInterimLatencyMs() === null) this.firstInterimLatencyMs.set(Date.now() - this.firstAudioAt);
          this.confirmed.set(this.state.finalText); this.provisional.set(this.state.provisionalText);
          this.finalSegments.set(this.state.finalCount);
          if (this.state.firstFinalAt && this.firstAudioAt) this.firstFinalLatencyMs.set(this.state.firstFinalAt - this.firstAudioAt);
          this.callback?.(this.state.visibleText, !this.state.hasProvisional);
        }
      };
      socket.onerror = () => { if (generation === this.generation && !this.stopping) this.connectionErrors.update((count) => count + 1); };
      socket.onclose = () => {
        if (this.socket !== socket || generation !== this.generation) return;
        if (this.connectedAt) this.connectionDurationMs.set(Date.now() - this.connectedAt);
        this.socket = null; this.disconnectAudioGraph();
        if (this.stopping) {
          if (!this.gracefulCloseRequested) { this.interruptedDuringStop = true; this.connectionErrors.update((count) => count + 1); }
          this.closeResolve?.(); return;
        }
        if (!this.boundedTrial && reconnect < 1 && navigator.onLine) { this.status.set('Connection interrupted. Reconnecting once…'); void this.open(generation, reconnect + 1); }
        else { this.status.set('Speech connection stopped. Confirmed words remain; you can type or retry.'); void this.finish(generation); }
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.status.set(error instanceof Error ? `${error.message} You can type instead.` : 'Speech comparison unavailable. You can type instead.');
      void this.finish(generation);
    }
  }

  async stopRecognition(): Promise<void> {
    if (!this.running || this.stopping) return;
    const generation = this.generation;
    this.stopping = true; this.status.set('Finalising speech…');
    this.audioLevel.set(0);
    this.stream?.getTracks().forEach((track) => track.stop());
    const socket = this.socket;
    let timedOut = false;
    let flushTimedOut = false;
    if (socket?.readyState === WebSocket.OPEN) {
      const finalisationStarted = Date.now();
      if (this.worklet) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => { flushTimedOut = true; resolve(); }, 1_000);
          this.flushResolve = () => { clearTimeout(timeout); resolve(); };
          try { this.worklet?.port.postMessage({ type: 'flush', id: generation }); }
          catch { clearTimeout(timeout); flushTimedOut = true; resolve(); }
        });
        this.flushResolve = null;
      }
      if (generation !== this.generation) return;
      if (socket.readyState === WebSocket.OPEN) {
        // CloseStream processes buffered audio and sends remaining Results before closing.
        // from_finalize is optional, so wait for the socket close rather than that flag.
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => { timedOut = true; resolve(); }, 2_000);
          this.closeResolve = () => { clearTimeout(timeout); resolve(); };
          try {
            socket.send(JSON.stringify({ type: 'Finalize' }));
            this.gracefulCloseRequested = true;
            socket.send(JSON.stringify({ type: 'CloseStream' }));
          } catch { clearTimeout(timeout); timedOut = true; resolve(); }
        });
        this.closeResolve = null;
      }
      this.finalisationDelayMs.set(Date.now() - finalisationStarted);
    }
    if (generation !== this.generation) return;
    await this.finish(generation);
    if (generation + 1 !== this.generation) return;
    this.status.set(flushTimedOut || timedOut || this.interruptedDuringStop ? 'Speech service could not confirm all final words. Check your saved answer before continuing.' : this.state.hasProvisional ? 'Stopped. Check the provisional words before using them.' : 'Stopped');
  }

  private async finish(generation: number) {
    if (generation !== this.generation) return;
    this.reportUsage();
    this.generation++;
    this.running = false; this.stopping = false; this.flushResolve?.(); this.flushResolve = null; this.closeResolve?.(); this.closeResolve = null;
    this.audioLevel.set(0);
    this.clearTrialWatchdog();
    if (this.connectedAt) this.connectionDurationMs.set(Date.now() - this.connectedAt);
    this.disconnectAudioGraph();
    this.socket?.close(); this.socket = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    await this.context?.close().catch(() => undefined); this.context = null; this.workletReady = null;
  }

  // Use when the question/context changes: in-flight callbacks are invalidated immediately.
  cancelRecognition() {
    this.reportUsage();
    this.generation++; this.callback = null; this.running = false; this.stopping = false;
    this.audioLevel.set(0);
    this.flushResolve?.(); this.flushResolve = null; this.closeResolve?.(); this.closeResolve = null;
    this.clearTrialWatchdog();
    this.disconnectAudioGraph();
    this.socket?.close(); this.socket = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    void this.context?.close().catch(() => undefined); this.context = null; this.workletReady = null;
    this.status.set('Stopped');
  }

  private reportUsage() {
    const eventId = this.usageEventId;
    this.usageEventId = null;
    if (!eventId || !this.usageCsrf || (this.audioSecondsSent() === 0 && this.connectionErrors() === 0)) return;
    void fetch('/api/guest/usage', { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.usageCsrf },
      body: JSON.stringify({ eventId, audioSeconds: Math.min(900, this.audioSecondsSent()), providerErrors: Math.min(10, this.connectionErrors()) }),
    }).catch(() => undefined);
  }

  private disconnectAudioGraph() {
    this.source?.disconnect(); this.source = null;
    this.worklet?.disconnect(); this.worklet = null;
    this.mute?.disconnect(); this.mute = null;
  }

  private clearTrialWatchdog() {
    if (this.trialWatchdog) clearTimeout(this.trialWatchdog);
    this.trialWatchdog = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.pageLeave);
  }

  private readTrialCount(): number | null {
    try { const count = Number(sessionStorage.getItem(this.trialStorageKey) || '0'); return Number.isInteger(count) && count >= 0 ? count : null; }
    catch { return null; }
  }

  private writeTrialCount(count: number): boolean {
    try { sessionStorage.setItem(this.trialStorageKey, String(count)); this.trialConnectionCount.set(count); return true; }
    catch { return false; }
  }
}
