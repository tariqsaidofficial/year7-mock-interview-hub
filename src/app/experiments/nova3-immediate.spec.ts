import { afterEach, describe, expect, it, vi } from 'vitest';
import { Nova3SpeechService } from './nova3-speech.service';

function harness(options: { flushDelayMs?: number; missingFlush?: boolean; sendFinal?: boolean; closeOnCloseStream?: boolean; emitOnConnect?: boolean } = {}) {
  vi.useFakeTimers();
  let ended: (() => void) | null = null;
  const track = { label: 'Synthetic adult microphone', readyState: 'live', stop: vi.fn(), addEventListener: vi.fn((name: string, listener: () => void) => { if (name === 'ended') ended = listener; }) };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('/session') ? { csrf: 'synthetic-csrf' } : { accessToken: 'synthetic-token' }), { headers: { 'Content-Type': 'application/json' } })));
  vi.stubGlobal('fetch', fetchMock);
  class Context {
    sampleRate = 16_000;
    audioWorklet = { addModule: async () => undefined };
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    createMediaStreamSource() { return { connect: vi.fn(() => { if (options.emitOnConnect) Worklet.latest.emit([71, 72]); }), disconnect: vi.fn() }; }
    createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  }
  class Worklet {
    static latest: Worklet;
    port = { onmessage: null as ((event: { data: ArrayBuffer | { type: string; id?: number } }) => void) | null,
      postMessage: vi.fn((message: { type: string; id: number }) => {
        if (message.type === 'flush' && !options.missingFlush) {
          setTimeout(() => {
            if (options.flushDelayMs) this.emit([99]);
            this.port.onmessage?.({ data: { type: 'flushed', id: message.id } });
          }, options.flushDelayMs ?? 0);
        }
      }) };
    connect = vi.fn(); disconnect = vi.fn();
    constructor() { Worklet.latest = this; }
    emit(values: number[]) { this.port.onmessage?.({ data: new Int16Array(values).buffer }); }
    emitBytes(count: number) { this.port.onmessage?.({ data: new ArrayBuffer(count) }); }
  }
  class Socket {
    static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
    static instances: Socket[] = [];
    static finalText = 'Confirmed synthetic words';
    readyState = 0;
    bufferedAmount = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    sent: (string | ArrayBuffer)[] = [];
    constructor(readonly url: string, readonly protocols: string[]) { Socket.instances.push(this); }
    send(data: string | ArrayBuffer) {
      this.sent.push(data);
      if (typeof data === 'string' && JSON.parse(data).type === 'Finalize' && options.sendFinal !== false) {
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'Results', start: 0, duration: 1, is_final: true, from_finalize: true, channel: { alternatives: [{ transcript: Socket.finalText }] } }) }));
      }
      if (typeof data === 'string' && JSON.parse(data).type === 'CloseStream' && options.closeOnCloseStream) queueMicrotask(() => this.close());
    }
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  vi.stubGlobal('AudioContext', Context); vi.stubGlobal('AudioWorkletNode', Worklet); vi.stubGlobal('WebSocket', Socket);
  const service = new Nova3SpeechService(); service.recognitionAvailable.set(true);
  return { service, stream, track, endTrack: () => { track.readyState = 'ended'; ended?.(); }, getUserMedia, fetchMock, Worklet, Socket };
}

describe('immediate Nova-3 PCM capture', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); });

  it('prepares at Begin, sends no answer audio, then records before a five-second socket delay and drains frames once in order', async () => {
    const { service, stream, getUserMedia, fetchMock, Worklet, Socket } = harness();
    service.prepareInterview(stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(Socket.instances).toHaveLength(1);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(service.isListening()).toBe(false);
    expect(Socket.instances[0].sent).toEqual([]);
    expect(service.startRecognition(() => undefined)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isListening()).toBe(true);
    expect(service.connectionState()).toBe('RECORDING_LOCAL');
    Worklet.latest.emit([1, 2]); Worklet.latest.emit([3, 4]); Worklet.latest.emit([5, 6]);
    expect(Socket.instances[0].sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    Socket.instances[0].open();
    expect(service.connectionReadyMs()).toBe(5_000);
    await vi.advanceTimersByTimeAsync(100);
    const audio = Socket.instances[0].sent.filter((item): item is ArrayBuffer => item instanceof ArrayBuffer);
    expect(audio.map((frame) => [...new Int16Array(frame)])).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(service.connectionState()).toBe('STREAMING');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('nova3-token'))).toHaveLength(1);
    const stop = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(0);
    expect(await stop).toBe(true);
    service.cancelRecognition();
  });

  it('stops during connection without losing queued PCM or advancing before final words', async () => {
    const { service, stream, Worklet, Socket } = harness();
    service.prepareInterview(stream);
    await vi.advanceTimersByTimeAsync(0);
    const text = vi.fn(); service.startRecognition(text);
    await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([11, 12]); Worklet.latest.emit([13, 14]);
    const stopping = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(service.connectionState()).toBe('FINALISING');
    Socket.instances[0].open();
    await vi.advanceTimersByTimeAsync(100);
    expect(await stopping).toBe(true);
    const sent = Socket.instances[0].sent;
    expect(sent.slice(0, 2).map((frame) => [...new Int16Array(frame as ArrayBuffer)])).toEqual([[11, 12], [13, 14]]);
    expect(JSON.parse(sent[2] as string).type).toBe('Finalize');
    expect(text).toHaveBeenCalledWith('Confirmed synthetic words', true);
    service.cancelRecognition();
  });

  it('sends textual KeepAlive while preconnected and no audio before Speak', async () => {
    const { service, stream, Socket, fetchMock } = harness();
    service.prepareInterview(stream);
    await vi.advanceTimersByTimeAsync(0);
    Socket.instances[0].open();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances[0].sent).toContain('{"type":"KeepAlive"}');
    expect(Socket.instances[0].sent.every((frame) => typeof frame === 'string')).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('nova3-token'))).toHaveLength(1);
    expect(service.isListening()).toBe(false);
    service.cancelRecognition();
  });

  it('measures connection readiness from preparation even when Speak happens later', async () => {
    const { service, stream, Socket } = harness();
    service.prepareInterview(stream);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    Socket.instances[0].open();
    expect(service.connectionReadyMs()).toBe(5_000);
    await vi.advanceTimersByTimeAsync(25_000);
    service.startRecognition(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.connectionReadyMs()).toBe(5_000);
    service.cancelRecognition();
  });

  it('keeps transport in local-capture state until actual PCM is submitted', async () => {
    const { service, stream, Worklet, Socket } = harness();
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    expect(service.connectionReadyMs()).toBe(0);
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    expect(service.connectionState()).toBe('RECORDING_LOCAL');
    expect(Socket.instances[0].sent).toEqual([]);
    Worklet.latest.emit([1, 2]);
    expect(service.connectionState()).toBe('STREAMING');
    service.cancelRecognition();
  });

  it('keeps a packet produced during AudioWorklet startup', async () => {
    const { service, stream, Socket } = harness({ emitOnConnect: true });
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0);
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Socket.instances[0].open();
    const audio = Socket.instances[0].sent.filter((frame): frame is ArrayBuffer => frame instanceof ArrayBuffer);
    expect(audio.map((frame) => [...new Int16Array(frame)])).toEqual([[71, 72]]);
    service.cancelRecognition();
  });

  it('waits for a delayed flush acknowledgement and sends its last PCM before Finalize', async () => {
    const { service, stream, Worklet, Socket } = harness({ flushDelayMs: 750 });
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([1]);
    const stopping = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(700);
    expect(Socket.instances[0].sent.some((frame) => typeof frame === 'string' && frame.includes('Finalize'))).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await stopping).toBe(true);
    const sent = Socket.instances[0].sent;
    expect(sent.filter((frame): frame is ArrayBuffer => frame instanceof ArrayBuffer).map((frame) => [...new Int16Array(frame)])).toEqual([[1], [99]]);
    expect(JSON.parse(sent.at(-1) as string).type).toBe('Finalize');
    service.cancelRecognition();
  });

  it('fails closed when AudioWorklet never acknowledges flush', async () => {
    const { service, stream, Worklet, Socket } = harness({ missingFlush: true });
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([1]);
    const stopping = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await stopping).toBe(false);
    expect(service.connectionState()).toBe('ERROR');
    expect(service.status()).toContain('did not confirm its final audio packet');
    expect(Socket.instances[0].sent.some((frame) => typeof frame === 'string' && frame.includes('Finalize'))).toBe(false);
    expect(Socket.instances[0].readyState).toBe(3);
    service.cancelRecognition();
  });

  it('ignores a flush acknowledgement that arrives after the timeout', async () => {
    const { service, stream, Worklet, Socket } = harness({ flushDelayMs: 1_200 });
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([1]);
    const stopping = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(1_050);
    expect(await stopping).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(service.connectionState()).toBe('ERROR');
    expect(Socket.instances[0].sent.some((frame) => typeof frame === 'string' && frame.includes('Finalize'))).toBe(false);
    service.cancelRecognition();
  });

  it('does not equate CloseStream closure with a transcript and preserves silent answers for explicit Skip', async () => {
    const { service, stream, Worklet, Socket } = harness({ sendFinal: false, closeOnCloseStream: true });
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([0, 0]);
    const stopping = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(await stopping).toBe(false);
    expect(service.confirmed()).toBe('');
    expect(service.status()).toContain('No spoken words were confirmed');
    expect(Socket.instances[0].readyState).toBe(3);
    service.cancelRecognition();
  });

  it('stops claiming microphone capture after its track ends unexpectedly', async () => {
    const { service, stream, endTrack, Worklet, Socket } = harness({ closeOnCloseStream: true });
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([1]);
    endTrack();
    expect(service.isListening()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await service.stopRecognition()).toBe(false);
    expect(service.connectionState()).toBe('ERROR');
    expect(service.status()).toContain('Microphone disconnected');
    service.cancelRecognition();
  });

  it('reuses a healthy socket for two questions without mixing their transcripts', async () => {
    const { service, stream, Worklet, Socket, fetchMock } = harness();
    service.prepareInterview(stream);
    await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    const first = vi.fn(); service.startRecognition(first);
    await vi.advanceTimersByTimeAsync(0); Worklet.latest.emit([1]);
    const firstStop = service.stopRecognition(); await vi.advanceTimersByTimeAsync(0); expect(await firstStop).toBe(true);
    Socket.finalText = 'Second synthetic answer';
    const second = vi.fn(); service.startRecognition(second);
    await vi.advanceTimersByTimeAsync(0); Worklet.latest.emit([2]);
    const secondStop = service.stopRecognition(); await vi.advanceTimersByTimeAsync(0); expect(await secondStop).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('Second synthetic answer', true);
    expect(service.confirmed()).toBe('Second synthetic answer');
    expect(Socket.instances).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('nova3-token'))).toHaveLength(1);
    service.cancelRecognition(); expect(Socket.instances[0].readyState).toBe(3);
  });

  it('reports buffer overflow and does not claim listening or successful finalisation', async () => {
    const { service, stream, Worklet, Socket } = harness();
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0);
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 9; i++) Worklet.latest.emitBytes(32_000);
    expect(service.isListening()).toBe(false);
    expect(service.connectionState()).toBe('FINALISING');
    Socket.instances[0].open();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await service.stopRecognition()).toBe(false);
    expect(service.connectionState()).toBe('ERROR');
    expect(service.status()).toContain('could not confirm');
    service.cancelRecognition();
  });

  it('marks an interrupted transmission as failed and retains confirmed text for manual recovery', async () => {
    const { service, stream, Worklet, Socket } = harness();
    service.prepareInterview(stream); await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
    service.startRecognition(() => undefined); await vi.advanceTimersByTimeAsync(0);
    Worklet.latest.emit([1, 2]);
    service.confirmed.set('Earlier confirmed words');
    Socket.instances[0].close();
    expect(service.isListening()).toBe(false);
    expect(service.connectionState()).toBe('ERROR');
    expect(await service.stopRecognition()).toBe(false);
    expect(service.confirmed()).toBe('Earlier confirmed words');
    service.cancelRecognition();
  });

  it('keeps typing available when microphone permission is denied and avoids a token grant', async () => {
    const { service, getUserMedia, fetchMock, Socket } = harness();
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    service.prepareInterview();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.startRecognition(() => undefined)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isListening()).toBe(false);
    expect(service.connectionState()).toBe('ERROR');
    expect(await service.stopRecognition()).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('nova3-token'))).toHaveLength(0);
    expect(Socket.instances).toHaveLength(0);
    service.cancelRecognition();
  });
});
