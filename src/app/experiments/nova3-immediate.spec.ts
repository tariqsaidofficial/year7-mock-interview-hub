import { afterEach, describe, expect, it, vi } from 'vitest';
import { Nova3SpeechService } from './nova3-speech.service';

function harness() {
  vi.useFakeTimers();
  const track = { label: 'Synthetic adult microphone', readyState: 'live', stop: vi.fn() };
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
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  }
  class Worklet {
    static latest: Worklet;
    port = { onmessage: null as ((event: { data: ArrayBuffer | { type: string; id?: number } }) => void) | null,
      postMessage: vi.fn((message: { type: string; id: number }) => {
        if (message.type === 'flush') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed', id: message.id } }));
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
      if (typeof data === 'string' && JSON.parse(data).type === 'Finalize') {
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'Results', start: 0, duration: 1, is_final: true, from_finalize: true, channel: { alternatives: [{ transcript: Socket.finalText }] } }) }));
      }
    }
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  vi.stubGlobal('AudioContext', Context); vi.stubGlobal('AudioWorkletNode', Worklet); vi.stubGlobal('WebSocket', Socket);
  const service = new Nova3SpeechService(); service.recognitionAvailable.set(true);
  return { service, stream, track, getUserMedia, fetchMock, Worklet, Socket };
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
