import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SpeechService } from '../speech.service';
import { Nova3SpeechService } from './nova3-speech.service';
import { wordErrorRate } from './wer';

interface Run { engine: string; scenario: string; reference: string; transcript: string; errors: number; words: number; wer: number | null; firstFinalMs: number | null; finalSegments: number; provisionalAtStop: boolean; connectionErrors: number }

@Component({
  selector: 'app-speech-lab', standalone: true, imports: [ReactiveFormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="surface-card" style="max-width:1000px;margin:0 auto;padding:32px">
      <p class="eyebrow">Local experiment · adults only</p>
      <h1>Browser speech vs Nova-3</h1>
      <p>Use consented adult speech only. Audio is streamed to the selected recogniser and is not saved by this app. Nova-3 uses Deepgram; Browser SpeechRecognition may use your browser or device provider. Neither result is pupil feedback.</p>
      <label><input type="checkbox" [formControl]="consent"> I am an adult and consent to this comparison and the selected provider processing my voice.</label>
      <div style="margin:20px 0"><label for="scenario">Scenario</label> <select id="scenario" [formControl]="scenario"><option>Natural British English</option><option>Non-native English</option><option>Continuous speech</option><option>Deliberate pauses</option><option>Short answer</option><option>Similar-sounding words</option><option>Longer response</option></select></div>
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
      <div style="overflow-x:auto"><table style="width:100%;text-align:left"><thead><tr><th>Engine</th><th>Scenario</th><th>WER</th><th>First final</th><th>Final segments</th><th>Provisional at stop</th><th>Connection errors</th></tr></thead><tbody>
        @for (run of runs(); track $index) { <tr><td>{{ run.engine }}</td><td>{{ run.scenario }}</td><td>{{ run.wer === null ? 'N/A' : (run.wer * 100).toFixed(1) + '%' }}</td><td>{{ run.firstFinalMs === null ? 'N/A' : run.firstFinalMs + ' ms' }}</td><td>{{ run.finalSegments }}</td><td>{{ run.provisionalAtStop ? 'Yes' : 'No' }}</td><td>{{ run.connectionErrors }}</td></tr> }
      </tbody></table></div>
      <p>WER is edit distance divided by the number of reference words. Review the exact reference and transcript for each run before drawing a conclusion.</p>
      @for (run of runs(); track $index) { <details><summary>{{ run.engine }} · {{ run.scenario }} · {{ run.errors }}/{{ run.words }} word errors</summary><p>Reference: {{ run.reference }}</p><p>Transcript: {{ run.transcript }}</p></details> }
    </section>
  `,
})
export class SpeechLabComponent {
  readonly browser = inject(SpeechService);
  readonly nova = inject(Nova3SpeechService);
  readonly consent = new FormControl(false, { nonNullable: true });
  readonly scenario = new FormControl('Natural British English', { nonNullable: true });
  readonly reference = new FormControl('', { nonNullable: true });
  readonly browserText = signal('');
  readonly runs = signal<Run[]>([]);
  private started = 0;
  private browserFirstFinal: number | null = null;
  private browserFinalSegments = 0;
  private browserLastFinal = '';
  private engine: 'Browser' | 'Nova-3' | null = null;
  canStart() { return this.consent.value && !!this.reference.value.trim() && !this.browser.isListening() && !this.nova.isListening(); }
  startBrowser() {
    if (!this.canStart()) return;
    this.browserText.set(''); this.started = Date.now(); this.browserFirstFinal = null; this.browserFinalSegments = 0; this.browserLastFinal = '';
    if (this.browser.startRecognition((text, final) => {
      this.browserText.set(text);
      if (final && text !== this.browserLastFinal) { this.browserFirstFinal ??= Date.now() - this.started; this.browserFinalSegments++; this.browserLastFinal = text; }
    })) this.engine = 'Browser';
  }
  stopBrowser() { if (this.engine !== 'Browser') return; this.browser.stopRecognition(); this.record('Browser', this.browserText(), this.browserFirstFinal, this.browserFinalSegments, false, 0); this.engine = null; }
  startNova() { if (!this.canStart()) return; this.started = Date.now(); if (this.nova.startRecognition(() => undefined)) this.engine = 'Nova-3'; }
  async stopNova() { if (this.engine !== 'Nova-3') return; await this.nova.stopRecognition(); this.record('Nova-3', [this.nova.confirmed(), this.nova.provisional()].filter(Boolean).join(' '), this.nova.firstFinalLatencyMs(), this.nova.finalSegments(), !!this.nova.provisional(), this.nova.connectionErrors()); this.engine = null; }
  private record(engine: string, transcript: string, firstFinalMs: number | null, finalSegments: number, provisionalAtStop: boolean, connectionErrors: number) {
    const reference = this.reference.value.trim(); const metric = wordErrorRate(reference, transcript);
    this.runs.update((all) => [...all, { engine, scenario: this.scenario.value, reference, transcript, errors: metric.errors, words: metric.referenceWords, wer: metric.wer, firstFinalMs, finalSegments, provisionalAtStop, connectionErrors }]);
  }
}
