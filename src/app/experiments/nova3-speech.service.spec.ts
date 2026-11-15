import { afterEach, describe, expect, it, vi } from 'vitest';
import { Nova3SpeechService } from './nova3-speech.service';

describe('bounded adult Nova-3 trial', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); });

  it('does not grant a token for microphone inspection, closes at 90 seconds and refuses a third socket', async () => {
    vi.useFakeTimers(); sessionStorage.clear();
    const track = { label: 'Synthetic headset', stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getAudioTracks: () => [track], getTracks: () => [track] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'headset', label: 'Synthetic headset' }] } });
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('/session') ? { csrf: 'synthetic-csrf' } : { accessToken: 'synthetic.jwt.token' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetchMock);
    class FakeContext {
      sampleRate = 16_000;
      audioWorklet = { addModule: async () => undefined };
      destination = {};
      resume = async () => undefined;
      close = async () => undefined;
      createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
      createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
    }
    class FakeWorklet { port = { onmessage: null, postMessage: vi.fn() }; connect = vi.fn(); disconnect = vi.fn(); }
    class FakeSocket {
      static OPEN = 1;
      static sockets: FakeSocket[] = [];
      readyState = 1;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      url: string;
      constructor(url: string) { this.url = url; FakeSocket.sockets.push(this); queueMicrotask(() => this.onopen?.()); }
      send = vi.fn();
      close() { this.readyState = 3; this.onclose?.(); }
    }
    vi.stubGlobal('AudioContext', FakeContext); vi.stubGlobal('AudioWorkletNode', FakeWorklet); vi.stubGlobal('WebSocket', FakeSocket);
    const speech = new Nova3SpeechService(); speech.recognitionAvailable.set(true); speech.boundedTrial = true; speech.useSunmarkeKeyterm = true; speech.onTrialHardStop = vi.fn();
    await speech.inspectMicrophones(); expect(fetchMock).not.toHaveBeenCalled();
    expect(speech.startRecognition(() => undefined)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.sockets).toHaveLength(1); expect(FakeSocket.sockets[0].url).not.toContain('keyterm=');
    await vi.advanceTimersByTimeAsync(89_999);
    expect(FakeSocket.sockets[0].readyState).toBe(3);
    expect(speech.status()).toContain('90 seconds');
    expect(speech.onTrialHardStop).toHaveBeenCalledOnce();
    expect(speech.startRecognition(() => undefined)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.sockets).toHaveLength(2);
    FakeSocket.sockets[1].close();
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.sockets).toHaveLength(2);
    speech.cancelRecognition();
    expect(speech.startRecognition(() => undefined)).toBe(false);
    expect(FakeSocket.sockets).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('Nova-3 finalisation lifecycle', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); });

  it('flushes PCM before control frames and retains delayed finals without from_finalize', async () => {
    vi.useFakeTimers();
    const track = { label: 'Synthetic input', stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) } });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('/session') ? { csrf: 'synthetic' } : { accessToken: 'synthetic.jwt' }), { headers: { 'Content-Type': 'application/json' } }))));
    class FakeContext {
      sampleRate = 48_000;
      audioWorklet = { addModule: async () => undefined };
      destination = {};
      resume = async () => undefined;
      close = async () => undefined;
      createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
      createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
    }
    class FakeWorklet {
      static latest: FakeWorklet;
      port = { onmessage: null as ((event: { data: ArrayBuffer | { type: string; id: number } }) => void) | null, postMessage: vi.fn((message: { type: string; id: number }) => {
        if (message.type === 'flush') {
          queueMicrotask(() => this.port.onmessage?.({ data: new Int16Array([1, 2]).buffer }));
          queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed', id: message.id } }));
        }
      }) };
      connect = vi.fn(); disconnect = vi.fn();
      constructor() { FakeWorklet.latest = this; }
    }
    class FakeSocket {
      static OPEN = 1;
      static latest: FakeSocket;
      static closeAfterFinal = true;
      readyState = 1;
      bufferedAmount = 0;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      send = vi.fn((data: string | ArrayBuffer) => {
        if (typeof data === 'string' && JSON.parse(data).type === 'CloseStream') {
          if (!FakeSocket.closeAfterFinal) return;
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'Results', start: 0, duration: 1, is_final: true, channel: { alternatives: [{ transcript: 'Confirmed final words' }] } }) }), 50);
          setTimeout(() => this.close(), 80);
        }
      });
      close() { this.readyState = 3; this.onclose?.(); }
      constructor(readonly url: string, readonly protocols: string[]) { FakeSocket.latest = this; queueMicrotask(() => this.onopen?.()); }
    }
    vi.stubGlobal('AudioContext', FakeContext); vi.stubGlobal('AudioWorkletNode', FakeWorklet); vi.stubGlobal('WebSocket', FakeSocket);
    const service = new Nova3SpeechService(); service.recognitionAvailable.set(true);
    const callback = vi.fn(); expect(service.startRecognition(callback)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.latest.url).toContain('sample_rate=48000');
    expect(FakeSocket.latest.protocols[0]).toBe('bearer');
    const stopping = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(3_200);
    await stopping;
    const sent = FakeSocket.latest.send.mock.calls.map(([data]) => data);
    expect(sent[0]).toBeInstanceOf(ArrayBuffer);
    expect(sent.slice(1).map((data) => JSON.parse(data as string).type)).toEqual(['Finalize', 'CloseStream']);
    expect(service.confirmed()).toBe('Confirmed final words');
    expect(service.finalSegments()).toBe(1);
    expect(callback).toHaveBeenCalledWith('Confirmed final words', true);
    expect(service.status()).toBe('Stopped');

    // A silent provider must not leave navigation waiting forever or promote interim text.
    FakeSocket.closeAfterFinal = false;
    expect(service.startRecognition(callback)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    FakeSocket.latest.onmessage?.({ data: JSON.stringify({ type: 'Results', start: 0, duration: 1, is_final: false, channel: { alternatives: [{ transcript: 'Unconfirmed phrase' }] } }) });
    const silentStop = service.stopRecognition();
    await vi.advanceTimersByTimeAsync(5_100);
    await silentStop;
    expect(service.confirmed()).toBe('');
    expect(service.provisional()).toBe('Unconfirmed phrase');
    expect(service.status()).toContain('could not confirm all final words');
    expect(FakeSocket.latest.readyState).toBe(3);
  });

  it('ignores late results after a question is cancelled', () => {
    const service = new Nova3SpeechService();
    service.confirmed.set('saved answer');
    service.cancelRecognition();
    expect(service.confirmed()).toBe('saved answer');
  });
});
