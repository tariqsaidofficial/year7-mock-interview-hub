import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SpeechService } from '../speech.service';
import { Nova3SpeechService } from './nova3-speech.service';
import { wordErrorRate } from './wer';
import { UiIconComponent } from '../ui-icon.component';

interface Run { engine: string; scenario: string; reference: string; transcript: string; errors: number; substitutions: number; deletions: number; insertions: number; words: number; wer: number | null; firstFinalMs: number | null; firstInterimMs: number | null; finalisationMs: number | null; readyMs: number | null; finalSegments: number; provisionalAtStop: boolean; connectionErrors: number; audioSeconds: number; connectionMs: number; microphone: string; sampleRate: number | null; captureMode: string; endpointing: string; keyterm: boolean }

@Component({
  selector: 'app-speech-lab', standalone: true, imports: [ReactiveFormsModule, UiIconComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './speech-lab.component.html',
  styleUrl: './speech-lab.component.css',
})
export class SpeechLabComponent {
  readonly browser = inject(SpeechService);
  readonly nova = inject(Nova3SpeechService);
  readonly consent = new FormControl(false, { nonNullable: true });
  readonly scenario = new FormControl('Natural British English', { nonNullable: true });
  readonly reference = new FormControl('', { nonNullable: true });
  readonly inputDevice = new FormControl('', { nonNullable: true });
  readonly captureMode = new FormControl<'native' | '16k'>('native', { nonNullable: true });
  readonly endpointing = new FormControl<'natural' | '300' | '500'>('natural', { nonNullable: true });
  readonly browserText = signal('');
  readonly deviceError = signal('');
  readonly novaRunActive = signal(false);
  readonly runs = signal<Run[]>([]);
  private started = 0;
  private browserFirstFinal: number | null = null;
  private browserFinalSegments = 0;
  private browserLastFinal = '';
  private engine: 'Browser' | 'Nova-3' | null = null;
  constructor() {
    this.nova.boundedTrial = true;
    this.nova.useSunmarkeKeyterm = false;
    this.nova.trialConnectionCount.set(this.nova.trialConnectionsUsed());
    this.nova.onTrialHardStop = () => void this.stopNova();
  }
  canStart() { return this.consent.value && !!this.reference.value.trim() && !this.browser.isListening() && !this.novaRunActive(); }
  async inspectMicrophones() {
    if (!this.consent.value) return;
    this.deviceError.set('');
    try { await this.nova.inspectMicrophones(); }
    catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      this.deviceError.set(name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.' : name === 'NotFoundError' ? 'No microphone was found. Connect an input device and try again.' : 'Microphone devices could not be checked. You can still type your reference.');
    }
  }
  startBrowser() {
    if (!this.canStart()) return;
    this.browserText.set(''); this.started = Date.now(); this.browserFirstFinal = null; this.browserFinalSegments = 0; this.browserLastFinal = '';
    if (this.browser.startRecognition((text, final) => {
      this.browserText.set(text);
      if (final && text !== this.browserLastFinal) { this.browserFirstFinal ??= Date.now() - this.started; this.browserFinalSegments++; this.browserLastFinal = text; }
    })) this.engine = 'Browser';
  }
  stopBrowser() { if (this.engine !== 'Browser') return; this.browser.stopRecognition(); this.record('Browser', this.browserText(), this.browserFirstFinal, this.browserFinalSegments, false, 0); this.engine = null; }
  startNova() { if (!this.canStart() || this.nova.trialConnectionsUsed() >= 2) return; this.started = Date.now(); this.nova.inputDeviceId = this.inputDevice.value; this.nova.captureMode = this.captureMode.value; this.nova.endpointing = this.endpointing.value; this.nova.useSunmarkeKeyterm = false; if (this.nova.startRecognition(() => undefined)) { this.engine = 'Nova-3'; this.novaRunActive.set(true); } }
  async stopNova() { if (this.engine !== 'Nova-3') return; this.engine = null; await this.nova.stopRecognition(); this.record('Nova-3', [this.nova.confirmed(), this.nova.provisional()].filter(Boolean).join(' '), this.nova.firstFinalLatencyMs(), this.nova.finalSegments(), !!this.nova.provisional(), this.nova.connectionErrors()); this.novaRunActive.set(false); }
  private record(engine: string, transcript: string, firstFinalMs: number | null, finalSegments: number, provisionalAtStop: boolean, connectionErrors: number) {
    const reference = this.reference.value.trim(); const metric = wordErrorRate(reference, transcript);
    this.runs.update((all) => [...all, { engine, scenario: this.scenario.value, reference, transcript, errors: metric.errors, substitutions: metric.substitutions, deletions: metric.deletions, insertions: metric.insertions, words: metric.referenceWords, wer: metric.wer, firstFinalMs, firstInterimMs: engine === 'Nova-3' ? this.nova.firstInterimLatencyMs() : null, finalisationMs: engine === 'Nova-3' ? this.nova.finalisationDelayMs() : null, readyMs: engine === 'Nova-3' ? this.nova.connectionReadyMs() : null, finalSegments, provisionalAtStop, connectionErrors, audioSeconds: engine === 'Nova-3' ? this.nova.audioSecondsSent() : 0, connectionMs: engine === 'Nova-3' ? this.nova.connectionDurationMs() : 0, microphone: engine === 'Nova-3' ? this.nova.selectedInputName() : 'Browser-selected', sampleRate: engine === 'Nova-3' ? this.nova.actualSampleRate() : null, captureMode: engine === 'Nova-3' ? this.captureMode.value : 'browser', endpointing: engine === 'Nova-3' ? this.endpointing.value : 'browser', keyterm: false }]);
  }
}
