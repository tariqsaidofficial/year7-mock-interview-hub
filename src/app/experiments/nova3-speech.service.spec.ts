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
