import { Injectable, signal } from '@angular/core';
import { guestCsrf } from '../session';
import { NovaResult, NovaTranscript } from './nova3-transcript';

type TranscriptCallback = (text: string, final: boolean) => void;
export type NovaCaptureMode = 'native' | '16k';
export type NovaEndpointing = 'natural' | '300' | '500';
export type NovaConnectionState = 'IDLE' | 'PREPARING' | 'CONNECTING' | 'READY' | 'RECORDING_LOCAL' | 'STREAMING' | 'FINALISING' | 'RECONNECTING' | 'ERROR' | 'CLOSED';

const MAX_BUFFER_BYTES = 1_048_576;
const MAX_BUFFER_SECONDS = 8;
const MAX_SOCKET_BACKLOG = 262_144;

@Injectable({ providedIn: 'root' })
export class Nova3SpeechService {
  readonly status = signal('Stopped');
  readonly connectionState = signal<NovaConnectionState>('IDLE');
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
  private captureGeneration = 0;
  private recording = false;
  private capturePromise: Promise<void> | null = null;
  private stopping: Promise<boolean> | null = null;
  private interviewMode = false;
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private stream: MediaStream | null = null;
  private streamPromise: Promise<MediaStream> | null = null;
  private context: AudioContext | null = null;
  private workletReady: Promise<void> | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mute: GainNode | null = null;
  private state = new NovaTranscript();
  private callback: TranscriptCallback | null = null;
  private queue: ArrayBuffer[] = [];
  private queuedBytes = 0;
  private nextSendAt = 0;
  private overflowed = false;
  private deliveryFailed = false;
  private idleClosed = false;
  private idleReconnects = 0;
  private recordingReconnects = 0;
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private flushResolve: (() => void) | null = null;
  private finalResolve: (() => void) | null = null;
  private closeResolve: (() => void) | null = null;
  private firstAudioAt = 0;
  private startedAt = 0;
  private connectedAt = 0;
  private audioBytes = 0;
  private trialWatchdog: ReturnType<typeof setTimeout> | null = null;
  private trialDeadline = 0;
  private readonly trialStorageKey = 'y7-nova3-live-trial-connections';
  private readonly pageLeave = () => this.cancelRecognition();
  private usageEventId: string | null = null;
  private usageCsrf = '';

  isListening() { return this.recording && !!this.worklet; }
  isCapturePending() { return !!this.capturePromise; }
  trialConnectionsUsed() { return this.readTrialCount() ?? 2; }

  async inspectMicrophones() {
    if (!this.recognitionAvailable()) throw new Error('Microphone diagnostics require a secure browser context.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      this.selectedInputName.set(stream.getAudioTracks()[0]?.label || 'Browser did not reveal the microphone name');
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableMicrophones.set(devices.filter((item) => item.kind === 'audioinput').map((item) => ({ id: item.deviceId, label: item.label || 'Unnamed microphone' })));
    } finally { stream.getTracks().forEach((track) => track.stop()); }
  }

  // Called from the Begin Interview click. The sound-check stream stays live, but its
  // audio is not connected to a worklet and cannot be buffered or sent yet.
  prepareInterview(soundCheckStream?: MediaStream | null): void {
    if (!this.recognitionAvailable() || !navigator.onLine) { this.status.set('Speech is unavailable. You can type every answer.'); return; }
    this.interviewMode = true;
    if (soundCheckStream) {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = soundCheckStream;
      this.selectedInputName.set(soundCheckStream.getAudioTracks()[0]?.label || 'Browser default');
    } else if (!this.stream && !this.streamPromise) {
      // Permission is requested at Begin Interview, not at first Speak.
      const generation = this.generation;
      this.streamPromise = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, ...(this.inputDeviceId ? { deviceId: { exact: this.inputDeviceId } } : {}) }, video: false });
      void this.streamPromise.then((stream) => {
        if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
        this.stream = stream; this.selectedInputName.set(stream.getAudioTracks()[0]?.label || 'Browser default');
      }).catch(() => { if (generation === this.generation) this.status.set('Microphone permission was denied. You can type every answer.'); }).finally(() => { this.streamPromise = null; });
    }
    try { this.prepareAudio(); }
    catch { this.connectionState.set('ERROR'); this.status.set('Audio preparation failed. You can type every answer.'); return; }
    if (!this.connectPromise && this.socket?.readyState !== WebSocket.OPEN) void this.connect(this.generation, 0).catch(() => undefined);
  }

  private prepareAudio() {
    if (!this.context) {
      // Construct and resume during the user gesture for iPad Safari.
      this.context = new AudioContext(this.captureMode === '16k' ? { sampleRate: 16_000 } : undefined);
      this.actualSampleRate.set(this.context.sampleRate);
      this.workletReady = this.context.audioWorklet.addModule('/experiments/nova3-pcm-worklet.js');
      void this.context.resume().catch(() => undefined);
    }
    if (this.connectionState() === 'IDLE' || this.connectionState() === 'CLOSED') this.connectionState.set('PREPARING');
  }

  startRecognition(onText: TranscriptCallback): boolean {
    if (!this.recognitionAvailable() || !navigator.onLine) { this.status.set('Speech unavailable. You can type instead.'); return false; }
    if (this.recording || this.capturePromise || this.stopping) return false;
    if (this.boundedTrial && (this.readTrialCount() ?? 2) >= 2) { this.status.set('The two-session trial limit has been reached.'); return false; }
    const generation = this.generation;
    const capture = ++this.captureGeneration;
    try { this.prepareAudio(); }
    catch { this.status.set('Audio capture unavailable. You can type instead.'); return false; }
    this.callback = onText;
    this.state = new NovaTranscript(); this.state.nextStream();
    this.confirmed.set(''); this.provisional.set(''); this.finalSegments.set(0);
    this.firstFinalLatencyMs.set(null); this.firstInterimLatencyMs.set(null); this.finalisationDelayMs.set(null);
    this.firstAudioAt = 0; this.startedAt = Date.now(); this.audioBytes = 0; this.audioSecondsSent.set(0);
    this.queue = []; this.queuedBytes = 0; this.nextSendAt = 0; this.overflowed = false; this.deliveryFailed = false; this.recordingReconnects = 0;
    this.usageEventId = crypto.randomUUID();
    if (this.boundedTrial) {
      this.trialDeadline = Date.now() + 90_000;
      this.trialWatchdog = setTimeout(() => {
        if (generation !== this.generation || capture !== this.captureGeneration) return;
        this.cancelRecognition(); this.status.set('Trial stopped automatically at 90 seconds.'); this.onTrialHardStop?.();
      }, 90_000);
      window.addEventListener('pagehide', this.pageLeave);
    }
    this.connectionState.set('PREPARING');
    this.status.set('Starting local microphone capture…');
    // Capture starts independently of token and WebSocket setup.
    const pendingCapture = this.startCapture(generation, capture);
    this.capturePromise = pendingCapture;
    void pendingCapture.finally(() => { if (this.capturePromise === pendingCapture) this.capturePromise = null; });
    if (!this.connectPromise && this.socket?.readyState !== WebSocket.OPEN) void this.connect(generation, 0).catch(() => undefined);
    return true;
  }

  private async startCapture(generation: number, capture: number) {
    try {
      if (this.streamPromise) await this.streamPromise;
      if (!this.stream || this.stream.getAudioTracks().every((track) => track.readyState === 'ended')) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, ...(this.inputDeviceId ? { deviceId: { exact: this.inputDeviceId } } : {}) }, video: false });
        if (generation !== this.generation || capture !== this.captureGeneration) { stream.getTracks().forEach((track) => track.stop()); return; }
        this.stream = stream;
        this.selectedInputName.set(stream.getAudioTracks()[0]?.label || 'Browser default');
      }
      await this.workletReady;
      await this.context?.resume();
      if (generation !== this.generation || capture !== this.captureGeneration || !this.context || !this.stream) return;
      const source = this.context.createMediaStreamSource(this.stream);
      const worklet = new AudioWorkletNode(this.context, 'nova3-pcm');
      const mute = this.context.createGain(); mute.gain.value = 0;
      source.connect(worklet); worklet.connect(mute); mute.connect(this.context.destination);
      this.source = source; this.worklet = worklet; this.mute = mute;
      this.recording = true;
      this.connectionState.set(this.socket?.readyState === WebSocket.OPEN ? 'STREAMING' : 'RECORDING_LOCAL');
      this.status.set(this.socket?.readyState === WebSocket.OPEN ? 'Listening with Nova-3' : 'Recording locally while speech service connects…');
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer | { type: string; id?: number; value?: number }>) => {
        if (generation !== this.generation || capture !== this.captureGeneration) return;
        if (!(event.data instanceof ArrayBuffer)) {
          if (event.data?.type === 'level') this.audioLevel.set(Math.min(1, (event.data.value || 0) * 8));
          if (event.data?.type === 'flushed' && event.data.id === capture) this.flushResolve?.();
          return;
        }
        this.enqueue(event.data);
      };
    } catch {
      if (generation !== this.generation || capture !== this.captureGeneration) return;
      this.recording = false; this.deliveryFailed = true; this.connectionState.set('ERROR');
      this.status.set('Microphone permission or capture failed. You can type every answer.');
      this.disconnectAudioGraph();
    }
  }

  private enqueue(frame: ArrayBuffer) {
    const sampleRate = this.context?.sampleRate || 48_000;
    if (this.queuedBytes + frame.byteLength > MAX_BUFFER_BYTES || (this.queuedBytes + frame.byteLength) / (2 * sampleRate) > MAX_BUFFER_SECONDS) {
      this.overflowed = true; this.deliveryFailed = true; this.recording = false; this.audioLevel.set(0);
      this.disconnectAudioGraph();
      this.connectionState.set('ERROR');
      this.status.set('Speech buffer filled before connection recovered. Check your answer and type any missing words.');
      void this.stopRecognition();
      return;
    }
    this.firstAudioAt ||= Date.now();
    this.queue.push(frame); this.queuedBytes += frame.byteLength;
    this.pump();
  }

  private pump() {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!this.queue.length || socket.bufferedAmount >= MAX_SOCKET_BACKLOG || Date.now() < this.nextSendAt) return;
    const frame = this.queue.shift()!;
    this.queuedBytes -= frame.byteLength;
    try {
      socket.send(frame);
      this.audioBytes += frame.byteLength;
      this.audioSecondsSent.set(this.audioBytes / (2 * (this.context?.sampleRate || 1)));
      // Drain recorded backlog at no more than twice realtime; the worklet
      // naturally emits larger packets, so sending them all at once is unsafe.
      this.nextSendAt = Date.now() + Math.max(1, frame.byteLength / (2 * (this.context?.sampleRate || 1)) * 500);
    } catch {
      this.queue.unshift(frame); this.queuedBytes += frame.byteLength;
      this.connectionErrors.update((count) => count + 1);
    }
  }

  private async token(): Promise<string> {
    const csrf = await guestCsrf(); this.usageCsrf = csrf;
    const response = await fetch('/api/guest/nova3-token', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf }, signal: AbortSignal.timeout(8_000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Speech service returned an unexpected page.');
    const data = await response.json() as { accessToken?: string; error?: string };
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Speech service is unavailable.');
    return data.accessToken;
  }

  private connect(generation: number, attempt: number): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    const pending = (async () => {
      for (let retry = attempt; retry <= (this.boundedTrial ? attempt : 1); retry++) {
        this.connectionState.set(retry ? 'RECONNECTING' : 'CONNECTING');
        try { await this.openSocket(generation); return; }
        catch (error) {
          if (generation !== this.generation) return;
          this.connectionErrors.update((count) => count + 1);
          if (retry === 0 && navigator.onLine && !this.boundedTrial && !(error instanceof DOMException && error.name === 'NotAllowedError')) {
            this.status.set('Speech connection interrupted. Retrying once while keeping your local audio…');
            continue;
          }
          this.connectionState.set('ERROR');
          this.status.set(`${error instanceof Error ? error.message : 'Speech connection failed.'} Check your answer; you can type instead.`);
          return;
        }
      }
    })();
    this.connectPromise = pending;
    void pending.finally(() => { if (this.connectPromise === pending) this.connectPromise = null; });
    return pending;
  }

  private async openSocket(generation: number): Promise<void> {
    await this.workletReady;
    if (this.streamPromise) await this.streamPromise;
    else if (!this.stream && this.capturePromise) await this.capturePromise;
    if (generation !== this.generation) return;
    if (!this.stream) throw new Error('Microphone is unavailable.');
    const token = await this.token();
    if (generation !== this.generation) return;
    if (this.boundedTrial && Date.now() >= this.trialDeadline) throw new Error('Trial time expired.');
    const query = new URLSearchParams({ model: 'nova-3', language: 'en-GB', interim_results: 'true', punctuate: 'true', smart_format: 'true', encoding: 'linear16', sample_rate: String(this.context?.sampleRate || 48_000) });
    if (this.endpointing !== 'natural') query.set('endpointing', this.endpointing);
    if (this.useSunmarkeKeyterm && !this.boundedTrial) query.append('keyterm', 'Sunmarke');
    if (this.boundedTrial) {
      const count = this.readTrialCount();
      if (count === null || count >= 2 || !this.writeTrialCount(count + 1)) throw new Error('The two-session trial limit has been reached.');
    }
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, ['bearer', token]);
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      let opened = false;
      const watchdog = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) { socket.close(); reject(new Error('Speech connection timed out.')); } }, 8_000);
      socket.onopen = () => {
        opened = true;
        clearTimeout(watchdog);
        if (generation !== this.generation) { socket.close(); resolve(); return; }
        this.connectedAt = Date.now(); this.connectionReadyMs.set(this.connectedAt - this.startedAt);
        this.connectionState.set(this.recording ? 'STREAMING' : 'READY');
        this.status.set(this.recording ? 'Listening with Nova-3' : 'Speech connection ready. Tap to speak.');
        this.startKeepAlive(socket);
        this.pump();
        resolve();
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        if (generation !== this.generation || this.socket !== socket) return;
        let result: NovaResult;
        try { result = JSON.parse(event.data) as NovaResult; } catch { return; }
        if (!this.state.receive(result)) return;
        if (result.is_final === false && this.firstAudioAt && this.firstInterimLatencyMs() === null) this.firstInterimLatencyMs.set(Date.now() - this.firstAudioAt);
        this.confirmed.set(this.state.finalText); this.provisional.set(this.state.provisionalText);
        this.finalSegments.set(this.state.finalCount);
        if (this.state.firstFinalAt && this.firstAudioAt) this.firstFinalLatencyMs.set(this.state.firstFinalAt - this.firstAudioAt);
        this.callback?.(this.state.visibleText, !this.state.hasProvisional);
        if (result.from_finalize) this.finalResolve?.();
      };
      socket.onerror = () => { if (generation === this.generation) this.connectionErrors.update((count) => count + 1); };
      socket.onclose = () => {
        clearTimeout(watchdog);
        if (this.socket !== socket) return;
        this.stopKeepAlive(); this.socket = null;
        if (this.connectedAt) this.connectionDurationMs.set(Date.now() - this.connectedAt);
        this.closeResolve?.();
        if (!opened) { reject(new Error('Speech connection closed before it was ready.')); return; }
        if (generation !== this.generation || this.stopping) return;
        if (this.recording && this.audioBytes > 0) {
          // Sent audio may have reached the provider. Replaying it risks duplicated words.
          this.deliveryFailed = true; this.connectionState.set('ERROR'); this.status.set('Speech connection stopped. Check confirmed words and type any missing speech.');
          this.disconnectAudioGraph(); this.recording = false;
        } else if (this.idleClosed) {
          this.idleClosed = false; this.connectionState.set('CLOSED');
        } else if (this.recording && !this.boundedTrial && this.recordingReconnects++ < 1) {
          void this.connect(generation, 0);
        } else if (this.interviewMode && navigator.onLine && this.idleReconnects++ < 1) {
          void this.connect(generation, 0);
        } else {
          this.connectionState.set('ERROR'); this.status.set('Speech connection stopped. Confirmed words remain; you can type or retry.');
        }
      };
    });
  }

  private startKeepAlive(socket: WebSocket) {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => { if (this.socket === socket && socket.readyState === WebSocket.OPEN && !this.recording && !this.queue.length) socket.send(JSON.stringify({ type: 'KeepAlive' })); }, 4_000);
    this.pumpTimer = setInterval(() => this.pump(), 20);
    this.idleTimer = setTimeout(() => { if (!this.recording && this.socket === socket) { this.idleClosed = true; socket.close(); } }, 120_000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    if (this.pumpTimer) clearInterval(this.pumpTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.keepAliveTimer = null; this.pumpTimer = null; this.idleTimer = null;
  }

  async stopRecognition(): Promise<boolean> {
    if (this.stopping) return this.stopping;
    if (this.deliveryFailed && !this.overflowed) return false;
    if (!this.recording && !this.worklet && !this.queue.length && !this.capturePromise) return !this.deliveryFailed;
    this.stopping = this.finaliseCapture();
    try { return await this.stopping; }
    finally { this.stopping = null; }
  }

  private async finaliseCapture(): Promise<boolean> {
    const generation = this.generation;
    const capture = this.captureGeneration;
    const started = Date.now();
    this.connectionState.set('FINALISING'); this.status.set('Finalising speech…');
    this.audioLevel.set(0);
    if (this.capturePromise) {
      const started = await Promise.race([this.capturePromise.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8_000))]);
      this.capturePromise = null;
      if (!started || (!this.worklet && !this.queue.length)) {
        this.captureGeneration++;
        this.connectionState.set('ERROR'); this.status.set('Microphone capture did not start. Please type your answer.');
        return false;
      }
    }
    if (this.worklet) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1_000);
        this.flushResolve = () => { clearTimeout(timeout); resolve(); };
        try { this.worklet?.port.postMessage({ type: 'flush', id: capture }); }
        catch { clearTimeout(timeout); resolve(); }
      });
      this.flushResolve = null;
    }
    if (generation !== this.generation || capture !== this.captureGeneration) return false;
    this.recording = false; this.disconnectAudioGraph();
    const deadline = Date.now() + 8_000;
    while (this.queue.length && Date.now() < deadline && generation === this.generation) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) await Promise.race([this.connectPromise || this.connect(generation, 0), new Promise((resolve) => setTimeout(resolve, 100))]);
      this.pump();
      if (this.queue.length) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (generation !== this.generation) return false;
    if (this.queue.length || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.deliveryFailed = true; this.connectionState.set('ERROR'); this.status.set('Speech could not reach the service. Check your answer and type any missing words before continuing.');
      return false;
    }
    const socket = this.socket;
    const finalised = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => { this.finalResolve = null; resolve(false); }, 3_000);
      this.finalResolve = () => { clearTimeout(timeout); this.finalResolve = null; resolve(true); };
      try { socket.send(JSON.stringify({ type: 'Finalize' })); }
      catch { clearTimeout(timeout); this.finalResolve = null; resolve(false); }
    });
    if (generation !== this.generation) return false;
    this.reportUsage(); this.clearTrialWatchdog();
    if (finalised && !this.overflowed) {
      this.finalisationDelayMs.set(Date.now() - started);
      this.callback = null;
      this.connectionState.set('READY'); this.status.set('Stopped');
      this.startKeepAlive(socket);
      return true;
    }
    // Without a finalisation acknowledgement, close to force any pending final Results.
    const closed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => { this.closeResolve = null; resolve(false); }, 2_000);
      this.closeResolve = () => { clearTimeout(timeout); this.closeResolve = null; resolve(true); };
      try { socket.send(JSON.stringify({ type: 'CloseStream' })); }
      catch { clearTimeout(timeout); this.closeResolve = null; resolve(false); }
    });
    if (generation !== this.generation) return false;
    this.finalisationDelayMs.set(Date.now() - started);
    this.callback = null;
    if (!closed && socket.readyState !== WebSocket.CLOSED) socket.close();
    this.connectionState.set(closed && !this.overflowed ? 'CLOSED' : 'ERROR');
    this.status.set(this.overflowed || !closed || this.state.hasProvisional ? 'Speech service could not confirm all final words. Check your answer before continuing.' : 'Stopped');
    return closed && !this.overflowed && !this.state.hasProvisional;
  }

  // A question or session boundary invalidates every pending callback.
  cancelRecognition() {
    this.reportUsage();
    this.generation++; this.captureGeneration++; this.callback = null; this.recording = false; this.stopping = null; this.capturePromise = null;
    this.stopKeepAlive(); this.clearTrialWatchdog();
    this.flushResolve?.(); this.flushResolve = null;
    this.finalResolve?.(); this.finalResolve = null;
    this.closeResolve?.(); this.closeResolve = null;
    this.audioLevel.set(0); this.queue = []; this.queuedBytes = 0; this.overflowed = false; this.deliveryFailed = false;
    this.disconnectAudioGraph();
    this.socket?.close(); this.socket = null; this.connectPromise = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; this.streamPromise = null;
    void this.context?.close().catch(() => undefined); this.context = null; this.workletReady = null;
    this.interviewMode = false; this.connectionState.set('CLOSED'); this.status.set('Stopped');
  }

  private reportUsage() {
    const eventId = this.usageEventId; this.usageEventId = null;
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
