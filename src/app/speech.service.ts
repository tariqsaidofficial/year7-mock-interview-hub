import { Injectable, signal } from '@angular/core';
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface RecognitionLike { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: RecognitionEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type SpeechWindow = Window & { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
@Injectable({ providedIn: 'root' })
export class SpeechService {
  readonly status = signal('Stopped');
  readonly recognitionAvailable = signal(typeof window !== 'undefined' && !!((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
  private recognition: RecognitionLike | null = null;
  startRecognition(onText: (text: string, final: boolean) => void): boolean {
    const Ctor = typeof window === 'undefined' ? undefined : (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Ctor || !navigator.onLine) { this.status.set('Speech recognition unavailable. Please type your answer.'); return false; }
    this.stopRecognition();
    const recognition = new Ctor(); this.recognition = recognition;
    recognition.lang = 'en-GB'; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) return;
      const final: string[] = []; const interim: string[] = [];
      for (const result of Array.from(event.results)) {
        const transcript = result[0].transcript.trim();
        if (!transcript) continue;
        if (result.isFinal) final.push(transcript);
        else interim.push(transcript);
      }
      this.status.set(interim.length ? 'Transcribing' : 'Listening');
      onText([...final, ...interim].join(' '), !interim.length);
    };
    recognition.onerror = (event) => { this.status.set(event.error === 'not-allowed' ? 'Microphone permission denied. Please type your answer.' : 'Microphone stopped. Please type your answer.'); this.stopRecognition(); };
    recognition.onend = () => { if (this.recognition === recognition) { this.recognition = null; this.status.set('Stopped'); } };
    try { recognition.start(); this.status.set('Listening'); return true; }
    catch { this.recognition = null; this.status.set('Microphone unavailable. Please type your answer.'); return false; }
  }
  stopRecognition() { const recognition = this.recognition; this.recognition = null; if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; try { recognition.stop(); } catch { /* already stopped */ } } this.status.set('Stopped'); }
  isListening() { return this.recognition !== null; }
}
