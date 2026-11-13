import { Injectable, signal } from '@angular/core';
import { QUESTIONS } from './interview.models';

export type AudioState = 'idle' | 'loading' | 'playing' | 'tap-to-play' | 'unavailable';

export function questionAudioPath(questionId: number): string {
  if (!Number.isInteger(questionId) || questionId < 1 || questionId > QUESTIONS.length) throw new RangeError('Unknown question');
  return `/audio/questions/q${String(questionId).padStart(2, '0')}.mp3`;
}

@Injectable({ providedIn: 'root' })
export class QuestionAudioService {
  readonly state = signal<AudioState>('idle');
  readonly message = signal('Question audio will be available after the approved files are added. You can read the question on screen.');
  private current: HTMLAudioElement | null = null;
  private generation = 0;
  private visited = new Set<number>();
  private preloadAudio = new Map<number, HTMLAudioElement>();

  enterQuestion(questionId: number) {
    this.stop();
    this.preload(questionId);
    this.preload(questionId + 1);
    if (this.visited.has(questionId)) return;
    this.visited.add(questionId);
    void this.play(questionId);
  }

  replay(questionId: number) { void this.play(questionId); }

  test() { void this.play(1); }

  private preload(questionId: number) {
    if (questionId > QUESTIONS.length || this.preloadAudio.has(questionId) || typeof Audio === 'undefined') return;
    const audio = new Audio(questionAudioPath(questionId));
    audio.preload = 'metadata';
    this.preloadAudio.set(questionId, audio);
  }

  async play(questionId: number): Promise<boolean> {
    this.stop();
    if (typeof Audio === 'undefined') {
      this.unavailable();
      return false;
    }
    this.preload(questionId);
    const audio = this.preloadAudio.get(questionId) || new Audio(questionAudioPath(questionId));
    this.current = audio;
    const generation = this.generation;
    audio.currentTime = 0;
    audio.onended = () => { if (generation === this.generation) { this.current = null; this.state.set('idle'); this.message.set('Question audio finished.'); } };
    audio.onerror = () => { if (generation === this.generation) this.unavailable(); };
    this.state.set('loading');
    this.message.set('Loading question audio…');
    try {
      await audio.play();
      if (generation !== this.generation) { audio.pause(); return false; }
      this.state.set('playing');
      this.message.set('Playing question audio.');
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError') {
        this.state.set('tap-to-play');
        this.message.set('Tap Replay question to hear the audio.');
      } else this.unavailable();
      return false;
    }
  }

  private unavailable() {
    this.current = null;
    this.state.set('unavailable');
    this.message.set('Question audio is not available yet. You can read the question and continue.');
  }

  stop() {
    this.generation++;
    if (this.current) {
      this.current.pause();
      this.current.onended = null;
      this.current.onerror = null;
      this.current = null;
    }
    this.state.set('idle');
  }

  reset() {
    this.stop();
    this.visited.clear();
  }
}
