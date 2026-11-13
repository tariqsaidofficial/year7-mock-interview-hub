import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeechService } from './speech.service';
class FakeRecognition {
  static current: FakeRecognition;
  lang = ''; interimResults = false; continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.current = this; }
  start() { /* synthetic */ }
  stop() { /* synthetic */ }
  emit(results: { isFinal: boolean; 0: { transcript: string } }[]) { this.onresult?.({ resultIndex: 0, results }); }
}
describe('browser speech recognition', () => {
  afterEach(() => { delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition; vi.unstubAllGlobals(); });
  it('replaces interim text with final text without duplicating typed words', () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    const service = new SpeechService();
    let answer = 'Typed start';
    expect(service.startRecognition((transcript) => { answer = ['Typed start', transcript].filter(Boolean).join(' '); })).toBe(true);
    expect(FakeRecognition.current.lang).toBe('en-GB');
    FakeRecognition.current.emit([{ isFinal: false, 0: { transcript: 'hello' } }]);
    expect(answer).toBe('Typed start hello');
    FakeRecognition.current.emit([{ isFinal: true, 0: { transcript: 'hello world.' } }]);
    expect(answer).toBe('Typed start hello world.');
    FakeRecognition.current.emit([{ isFinal: true, 0: { transcript: 'hello world.' } }, { isFinal: true, 0: { transcript: 'I helped' } }, { isFinal: false, 0: { transcript: 'my friend' } }]);
    expect(answer).toBe('Typed start hello world. I helped my friend');
    FakeRecognition.current.emit([{ isFinal: true, 0: { transcript: 'hello world.' } }, { isFinal: true, 0: { transcript: 'I helped my friend.' } }]);
    expect(answer).toBe('Typed start hello world. I helped my friend.');
    service.stopRecognition();
    FakeRecognition.current.emit([{ isFinal: true, 0: { transcript: 'late' } }]);
    expect(answer).toBe('Typed start hello world. I helped my friend.');
  });
});
