import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy,
  Output, ViewChild, inject,
} from '@angular/core';
import { drawVoiceOrbit, microphoneRms, noiseGatedLevel, smoothLevel } from './voice-orb.renderer';

export type VoiceOrbState = 'idle' | 'ready' | 'testing' | 'listening' | 'finalising' | 'error';

/**
 * VISUAL-ONLY reference for integration into the EXISTING app.
 * The interview/Deepgram service remains the sole owner of getUserMedia and mic lifecycle.
 * Pass the existing MediaStream, or the level produced by its existing AudioWorklet.
 */
@Component({
  selector: 'app-voice-orb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './voice-orb.component.html',
  styleUrl: './voice-orb.component.css',
})
export class VoiceOrbComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('orbitCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @Input() state: VoiceOrbState = 'idle';
  @Input() stream: MediaStream | null = null;
  /** Preferred if the Nova-3 worklet already exposes a normalised level. */
  @Input() level: number | null = null;
  @Input() buttonLabel = 'Start speaking';
  @Input() disabled = false;
  @Output() orbToggle = new EventEmitter<void>();

  private readonly zone = inject(NgZone);
  private viewReady = false;
  private currentStream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frame = 0;
  private lastFrame = 0;
  private smoothed = 0;
  private samples?: Uint8Array<ArrayBuffer>;
  private frequency?: Uint8Array<ArrayBuffer>;

  get active(): boolean {
    return this.state === 'listening' || this.state === 'testing';
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.draw(0);
    void this.synchronise();
  }

  ngOnChanges(): void {
    if (!this.viewReady) return;
    void this.synchronise();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.hidden) {
      this.cancelFrame();
      this.smoothed = 0;
      this.draw(0);
    } else {
      void this.synchronise();
    }
  }

  private async synchronise(): Promise<void> {
    // Input level takes precedence: no second AudioContext or capture path is created.
    if (this.level !== null) {
      this.teardownAudio();
      this.smoothed = this.active ? smoothLevel(this.smoothed, noiseGatedLevel(this.level / 8)) : 0;
      this.draw(this.smoothed);
      return;
    }
    if (!this.active || !this.stream || document.hidden) {
      this.teardownAudio();
      this.draw(0);
      return;
    }
    if (this.currentStream === this.stream && this.analyser) return;
    this.teardownAudio();
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(this.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser); // Deliberately never connect to speakers.
      this.currentStream = this.stream;
      this.context = context;
      this.analyser = analyser;
      this.samples = new Uint8Array(analyser.fftSize);
      this.frequency = new Uint8Array(analyser.frequencyBinCount);
      await context.resume();
      if (this.context !== context) return;
      this.zone.runOutsideAngular(() => {
        this.frame = requestAnimationFrame(this.paintFrame);
      });
    } catch {
      this.teardownAudio();
      this.draw(0);
      // The recording service owns the microphone error state.
    }
  }

  private readonly paintFrame = (time: number): void => {
    if (!this.analyser || !this.active || document.hidden) return;
    this.frame = requestAnimationFrame(this.paintFrame);
    if (time - this.lastFrame < 45) return; // About 22fps; cheap on mobile.
    this.lastFrame = time;
    if (!this.samples || !this.frequency) return;
    this.analyser.getByteTimeDomainData(this.samples);
    this.analyser.getByteFrequencyData(this.frequency);
    const target = noiseGatedLevel(microphoneRms(this.samples));
    this.smoothed = smoothLevel(this.smoothed, target);
    this.draw(this.smoothed, this.frequency);
  };

  private draw(level: number, frequency?: Uint8Array): void {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) drawVoiceOrbit(canvas, level, frequency);
  }

  private cancelFrame(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private teardownAudio(): void {
    this.cancelFrame();
    this.lastFrame = 0;
    this.smoothed = 0;
    const context = this.context;
    this.context = null;
    this.currentStream = null;
    this.analyser = null;
    this.samples = undefined;
    this.frequency = undefined;
    if (context) void context.close().catch(() => undefined);
    // Never stop MediaStream tracks here: they belong to the existing speech service.
  }

  ngOnDestroy(): void {
    this.viewReady = false;
    this.teardownAudio();
  }
}
