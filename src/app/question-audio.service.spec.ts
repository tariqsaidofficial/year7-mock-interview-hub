import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionAudioService, questionAudioPath } from './question-audio.service';

class FakeAudio {
  static instances: FakeAudio[] = [];
  static failWith: Error | null = null;
  preload = '';
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(async () => { if (FakeAudio.failWith) throw FakeAudio.failWith; });
  constructor(readonly src: string) { FakeAudio.instances.push(this); }
}

describe('static question audio', () => {
  afterEach(() => { vi.unstubAllGlobals(); FakeAudio.instances = []; FakeAudio.failWith = null; });

  it('maps exactly ten approved question files', () => {
    expect(questionAudioPath(1)).toBe('/audio/questions/q01.mp3');
    expect(questionAudioPath(10)).toBe('/audio/questions/q10.mp3');
    expect(() => questionAudioPath(11)).toThrow();
  });

  it('attempts first-visit playback, preloads the next file and stops previous audio on navigation', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const service = new QuestionAudioService();
    service.enterQuestion(1);
    expect(FakeAudio.instances.map((audio) => audio.src)).toEqual(['/audio/questions/q01.mp3', '/audio/questions/q02.mp3']);
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
    service.enterQuestion(2);
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(FakeAudio.instances[1].play).toHaveBeenCalledTimes(1);
    service.enterQuestion(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
    service.replay(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(2);
  });

  it('shows a tap-to-play state for Safari-style gesture rejection', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.failWith = new DOMException('Gesture required', 'NotAllowedError');
    const service = new QuestionAudioService();
    expect(await service.play(1)).toBe(false);
    expect(service.state()).toBe('tap-to-play');
    expect(service.message()).toContain('Tap Replay');
  });

  it('keeps text available when the audio file cannot play', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.failWith = new DOMException('Missing', 'NotSupportedError');
    const service = new QuestionAudioService();
    expect(await service.play(1)).toBe(false);
    expect(service.state()).toBe('unavailable');
  });
});
