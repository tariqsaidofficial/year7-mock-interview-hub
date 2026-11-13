import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SpeechService } from '../speech.service';
import { Nova3SpeechService } from './nova3-speech.service';
import { wordErrorRate } from './wer';

interface Run { engine: string; scenario: string; reference: string; transcript: string; errors: number; substitutions: number; deletions: number; insertions: number; words: number; wer: number | null; firstFinalMs: number | null; firstInterimMs: number | null; readyMs: number | null; finalSegments: number; provisionalAtStop: boolean; connectionErrors: number; audioSeconds: number; connectionMs: number; microphone: string; sampleRate: number | null; captureMode: string; endpointing: string; keyterm: boolean }

@Component({
  selector: 'app-speech-lab', standalone: true, imports: [ReactiveFormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="surface-card" style="max-width:1000px;margin:0 auto;padding:32px">
      <p class="eyebrow">Local experiment · adults only</p>
      <h1>Browser speech vs Nova-3</h1>
      <p>Use consented adult speech only. Audio is streamed to the selected recogniser and is not saved by this app. Nova-3 uses Deepgram; Browser SpeechRecognition may use your browser or device provider. Neither result is pupil feedback.</p>
      <label><input type="checkbox" [formControl]="consent"> I am an adult and consent to this comparison and the selected provider processing my voice.</label>
      <div style="margin:20px 0"><label for="scenario">Scenario</label> <select id="scenario" [formControl]="scenario"><option>Natural British English</option><option>Non-native English</option><option>Continuous speech</option><option>Deliberate pauses</option><option>Short answer</option><option>Similar-sounding words</option><option>Longer response</option></select></div>
      <div style="margin:20px 0"><button type="button" class="secondary-button" [disabled]="!consent.value || browser.isListening() || nova.isListening()" (click)="inspectMicrophones()">Check microphone devices</button>
        <label for="nova-input"> Nova-3 input</label> <select id="nova-input" [formControl]="inputDevice"><option value="">Browser default</option>@for (device of nova.availableMicrophones(); track device.id) { <option [value]="device.id">{{ device.label }}</option> }</select>
        <p>Detected default: {{ nova.selectedInputName() }}. The browser recognition engine controls its own microphone and does not offer device selection here. Bluetooth hands-free mode may sound different from wired EarPods; compare both with the same script.</p>
      </div>
      <div style="margin:20px 0"><label for="capture-mode">Nova-3 audio rate</label> <select id="capture-mode" [formControl]="captureMode"><option value="native">Native device rate</option><option value="16k">Browser-resampled 16 kHz</option></select>
        <label for="endpointing"> Endpointing</label> <select id="endpointing" [formControl]="endpointing"><option value="natural">Provider default</option><option value="300">300 ms</option><option value="500">500 ms</option></select>
        <label><input type="checkbox" [formControl]="sunmarkeKeyterm"> Use fixed Sunmarke keyterm</label>
        <p>Actual transmitted PCM rate: {{ nova.actualSampleRate() || 'not started' }} Hz. If the browser cannot open 16 kHz audio, try native rate. No expected answer text is sent as a keyterm.</p>
      </div>
      <label for="reference">Exact words spoken in this run, including deliberate repetitions</label>
      <textarea id="reference" class="text-field" [formControl]="reference" rows="3" placeholder="Enter the exact reference before each run"></textarea>
      <p>Run each engine separately. Repeat the same script as closely as possible; edit the reference to reflect the words actually spoken. This page does not record audio.</p>
      <div class="action-row">
        <button type="button" class="secondary-button" [disabled]="!canStart() || browser.isListening()" (click)="startBrowser()">Start browser engine</button>
        <button type="button" class="secondary-button" [disabled]="!browser.isListening()" (click)="stopBrowser()">Stop browser</button>
        <button type="button" class="secondary-button" [disabled]="!canStart() || nova.isListening()" (click)="startNova()">Start Nova-3</button>
        <button type="button" class="secondary-button" [disabled]="!nova.isListening()" (click)="stopNova()">Stop Nova-3</button>
      </div>
      <p role="status">Browser: {{ browser.status() }} · Nova-3: {{ nova.status() }}</p>
      <p><strong>Browser transcript:</strong> {{ browserText() || '—' }}</p>
      <p><strong>Nova confirmed:</strong> {{ nova.confirmed() || '—' }}</p>
      <p><strong>Nova provisional:</strong> {{ nova.provisional() || '—' }}</p>
      <p>Typing remains available. If a connection fails, the words shown here remain until you start another run or leave this local page.</p>
      <h2>Session results (memory only)</h2>
      <div style="overflow-x:auto"><table style="width:100%;text-align:left"><thead><tr><th>Engine</th><th>Scenario</th><th>WER</th><th>Ready</th><th>First interim</th><th>First final</th><th>Final segments</th><th>Provisional at stop</th><th>Errors</th><th>Audio sent</th><th>Connection</th></tr></thead><tbody>
        @for (run of runs(); track $index) { <tr><td>{{ run.engine }}</td><td>{{ run.scenario }}</td><td>{{ run.wer === null ? 'N/A' : (run.wer * 100).toFixed(1) + '%' }}</td><td>{{ run.readyMs === null ? 'N/A' : run.readyMs + ' ms' }}</td><td>{{ run.firstInterimMs === null ? 'N/A' : run.firstInterimMs + ' ms' }}</td><td>{{ run.firstFinalMs === null ? 'N/A' : run.firstFinalMs + ' ms' }}</td><td>{{ run.finalSegments }}</td><td>{{ run.provisionalAtStop ? 'Yes' : 'No' }}</td><td>{{ run.connectionErrors }}</td><td>{{ run.audioSeconds.toFixed(1) }} s</td><td>{{ run.connectionMs }} ms</td></tr> }
      </tbody></table></div>
      <p>WER is edit distance divided by the number of reference words. Review the exact reference and transcript for each run before drawing a conclusion.</p>
      @for (run of runs(); track $index) { <details><summary>{{ run.engine }} · {{ run.scenario }} · {{ run.errors }}/{{ run.words }} word errors</summary><p>Reference: {{ run.reference }}</p><p>Transcript: {{ run.transcript }}</p><p>Substitutions {{ run.substitutions }} · deletions {{ run.deletions }} · insertions {{ run.insertions }}</p><p>Microphone: {{ run.microphone }} · {{ run.sampleRate || 'unknown' }} Hz · {{ run.captureMode }} · endpointing {{ run.endpointing }} · Sunmarke keyterm {{ run.keyterm ? 'on' : 'off' }}</p></details> }
    </section>
  `,
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
  readonly sunmarkeKeyterm = new FormControl(false, { nonNullable: true });
  readonly browserText = signal('');
  readonly runs = signal<Run[]>([]);
  private started = 0;
  private browserFirstFinal: number | null = null;
  private browserFinalSegments = 0;
  private browserLastFinal = '';
  private engine: 'Browser' | 'Nova-3' | null = null;
  canStart() { return this.consent.value && !!this.reference.value.trim() && !this.browser.isListening() && !this.nova.isListening(); }
  async inspectMicrophones() { if (!this.consent.value) return; try { await this.nova.inspectMicrophones(); } catch { this.nova.status.set('Microphone devices could not be checked. Typing remains available.'); } }
  startBrowser() {
    if (!this.canStart()) return;
    this.browserText.set(''); this.started = Date.now(); this.browserFirstFinal = null; this.browserFinalSegments = 0; this.browserLastFinal = '';
    if (this.browser.startRecognition((text, final) => {
      this.browserText.set(text);
      if (final && text !== this.browserLastFinal) { this.browserFirstFinal ??= Date.now() - this.started; this.browserFinalSegments++; this.browserLastFinal = text; }
    })) this.engine = 'Browser';
  }
  stopBrowser() { if (this.engine !== 'Browser') return; this.browser.stopRecognition(); this.record('Browser', this.browserText(), this.browserFirstFinal, this.browserFinalSegments, false, 0); this.engine = null; }
  startNova() { if (!this.canStart()) return; this.started = Date.now(); this.nova.inputDeviceId = this.inputDevice.value; this.nova.captureMode = this.captureMode.value; this.nova.endpointing = this.endpointing.value; this.nova.useSunmarkeKeyterm = this.sunmarkeKeyterm.value; if (this.nova.startRecognition(() => undefined)) this.engine = 'Nova-3'; }
  async stopNova() { if (this.engine !== 'Nova-3') return; await this.nova.stopRecognition(); this.record('Nova-3', [this.nova.confirmed(), this.nova.provisional()].filter(Boolean).join(' '), this.nova.firstFinalLatencyMs(), this.nova.finalSegments(), !!this.nova.provisional(), this.nova.connectionErrors()); this.engine = null; }
  private record(engine: string, transcript: string, firstFinalMs: number | null, finalSegments: number, provisionalAtStop: boolean, connectionErrors: number) {
    const reference = this.reference.value.trim(); const metric = wordErrorRate(reference, transcript);
    this.runs.update((all) => [...all, { engine, scenario: this.scenario.value, reference, transcript, errors: metric.errors, substitutions: metric.substitutions, deletions: metric.deletions, insertions: metric.insertions, words: metric.referenceWords, wer: metric.wer, firstFinalMs, firstInterimMs: engine === 'Nova-3' ? this.nova.firstInterimLatencyMs() : null, readyMs: engine === 'Nova-3' ? this.nova.connectionReadyMs() : null, finalSegments, provisionalAtStop, connectionErrors, audioSeconds: engine === 'Nova-3' ? this.nova.audioSecondsSent() : 0, connectionMs: engine === 'Nova-3' ? this.nova.connectionDurationMs() : 0, microphone: engine === 'Nova-3' ? this.nova.selectedInputName() : 'Browser-selected', sampleRate: engine === 'Nova-3' ? this.nova.actualSampleRate() : null, captureMode: engine === 'Nova-3' ? this.captureMode.value : 'browser', endpointing: engine === 'Nova-3' ? this.endpointing.value : 'browser', keyterm: engine === 'Nova-3' && this.sunmarkeKeyterm.value }]);
  }
}
