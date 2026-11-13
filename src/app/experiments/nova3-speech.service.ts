import { Injectable, signal } from '@angular/core';
import { guestCsrf } from '../session';
import { NovaResult, NovaTranscript } from './nova3-transcript';

type TranscriptCallback = (text: string, final: boolean) => void;

@Injectable({ providedIn: 'root' })
export class Nova3SpeechService {
  readonly status = signal('Stopped');
  readonly recognitionAvailable = signal(typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.AudioContext && !!window.AudioWorkletNode && !!window.WebSocket && window.isSecureContext);
  readonly confirmed = signal('');
  readonly provisional = signal('');
  readonly firstFinalLatencyMs = signal<number | null>(null);
  readonly connectionErrors = signal(0);
  readonly finalSegments = signal(0);
  private generation = 0;
  private running = false;
  private stopping = false;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private workletReady: Promise<void> | null = null;
  private worklet: AudioWorkletNode | null = null;
  private state = new NovaTranscript();
  private callback: TranscriptCallback | null = null;
  private firstAudioAt = 0;
  private finalizeResolve: (() => void) | null = null;

  isListening() { return this.running; }

  startRecognition(onText: TranscriptCallback): boolean {
    if (!this.recognitionAvailable() || !navigator.onLine) { this.status.set('Speech comparison unavailable. You can type instead.'); return false; }
    if (this.running) return false;
    const generation = ++this.generation;
    this.running = true; this.stopping = false; this.callback = onText;
    this.state = new NovaTranscript(); this.confirmed.set(''); this.provisional.set('');
    this.firstFinalLatencyMs.set(null); this.connectionErrors.set(0); this.finalSegments.set(0);
    try {
      // Construct and resume during the click gesture for iPad Safari.
      this.context = new AudioContext();
      this.workletReady = this.context.audioWorklet.addModule('/experiments/nova3-pcm-worklet.js');
      void this.context.resume().catch(() => undefined);
    } catch { this.running = false; this.status.set('Audio capture unavailable. You can type instead.'); return false; }
    this.status.set('Connecting to Nova-3…');
    void this.open(generation, 0);
    return true;
  }

  private async token(): Promise<string> {
    const csrf = await guestCsrf();
    const response = await fetch('/api/guest/nova3-token', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf }, signal: AbortSignal.timeout(8_000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Speech service returned an unexpected page.');
    const data = await response.json() as { accessToken?: string; error?: string };
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Speech comparison is unavailable.');
    return data.accessToken;
  }

  private async open(generation: number, reconnect: number) {
    try {
      if (!this.stream) this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== this.generation || this.stopping) return;
      if (!this.context || !this.workletReady) throw new Error('Audio capture unavailable.');
      await this.workletReady;
      await this.context.resume();
      if (generation !== this.generation || this.stopping) return;
      const token = await this.token();
      if (generation !== this.generation || this.stopping) return;
      const query = new URLSearchParams({ model: 'nova-3', language: 'en-GB', interim_results: 'true', punctuate: 'true', smart_format: 'true', encoding: 'linear16', sample_rate: String(this.context.sampleRate) });
      const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, ['bearer', token]);
      this.socket = socket;
      this.state.nextStream();
      socket.onopen = () => {
        if (generation !== this.generation || this.stopping) { socket.close(); return; }
        this.status.set(reconnect ? 'Reconnected. Continue speaking.' : 'Listening with Nova-3');
        if (!this.context || !this.stream) return;
        const source = this.context.createMediaStreamSource(this.stream);
        const worklet = new AudioWorkletNode(this.context, 'nova3-pcm');
        const mute = this.context.createGain(); mute.gain.value = 0;
        source.connect(worklet); worklet.connect(mute); mute.connect(this.context.destination);
        worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          if (generation !== this.generation || socket.readyState !== WebSocket.OPEN) return;
          this.firstAudioAt ||= Date.now();
          socket.send(event.data);
        };
        this.worklet = worklet;
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        if (generation !== this.generation) return;
        let result: NovaResult;
        try { result = JSON.parse(event.data) as NovaResult; } catch { return; }
        if (this.state.receive(result)) {
          this.confirmed.set(this.state.finalText); this.provisional.set(this.state.provisionalText);
          this.finalSegments.set(this.state.finalCount);
          if (this.state.firstFinalAt && this.firstAudioAt) this.firstFinalLatencyMs.set(this.state.firstFinalAt - this.firstAudioAt);
          this.callback?.(this.state.visibleText, !this.state.hasProvisional);
        }
        if (result.from_finalize) this.finalizeResolve?.();
      };
      socket.onerror = () => { if (generation === this.generation && !this.stopping) this.connectionErrors.update((count) => count + 1); };
      socket.onclose = () => {
        if (this.socket !== socket || generation !== this.generation) return;
        this.socket = null; this.worklet?.disconnect(); this.worklet = null;
        if (this.stopping) { this.finalizeResolve?.(); return; }
        if (reconnect < 1 && navigator.onLine) { this.status.set('Connection interrupted. Reconnecting once…'); void this.open(generation, reconnect + 1); }
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
    this.stopping = true; this.status.set('Finalising speech…');
    this.stream?.getTracks().forEach((track) => track.stop());
    this.worklet?.port.postMessage('flush');
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await new Promise<void>((resolve) => {
        this.finalizeResolve = resolve;
        socket.send(JSON.stringify({ type: 'Finalize' }));
        setTimeout(() => resolve(), 2_000);
      });
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'CloseStream' }));
    }
    await this.finish(this.generation);
    this.status.set(this.state.hasProvisional ? 'Stopped. Check the provisional words before using them.' : 'Stopped');
  }

  private async finish(generation: number) {
    if (generation !== this.generation) return;
    this.generation++;
    this.running = false; this.stopping = false; this.finalizeResolve = null;
    this.worklet?.disconnect(); this.worklet = null;
    this.socket?.close(); this.socket = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    await this.context?.close().catch(() => undefined); this.context = null; this.workletReady = null;
  }

  // Use when the question/context changes: in-flight callbacks are invalidated immediately.
  cancelRecognition() {
    this.generation++; this.callback = null; this.running = false; this.stopping = false;
    this.worklet?.disconnect(); this.worklet = null;
    this.socket?.close(); this.socket = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    void this.context?.close().catch(() => undefined); this.context = null; this.workletReady = null;
    this.status.set('Stopped');
  }
}
