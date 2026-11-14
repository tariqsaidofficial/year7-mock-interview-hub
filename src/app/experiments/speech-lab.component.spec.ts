import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SpeechService } from '../speech.service';
import { Nova3SpeechService } from './nova3-speech.service';
import { SpeechLabComponent } from './speech-lab.component';

describe('Speech Lab final transcript metric', () => {
  it('excludes unconfirmed interim words from the recorded WER', async () => {
    const nova = {
      boundedTrial: false, useSunmarkeKeyterm: false, trialConnectionCount: { set: vi.fn() },
      trialConnectionsUsed: () => 0, startRecognition: () => true, stopRecognition: vi.fn().mockResolvedValue(undefined),
      confirmed: () => 'I like science', provisional: () => 'and maths', firstFinalLatencyMs: () => 10,
      finalSegments: () => 1, connectionErrors: () => 0, firstInterimLatencyMs: () => 5,
      finalisationDelayMs: () => 40, connectionReadyMs: () => 8, audioSecondsSent: () => 1,
      connectionDurationMs: () => 100, selectedInputName: () => 'Synthetic mic', actualSampleRate: () => 48000,
    };
    TestBed.configureTestingModule({ providers: [
      { provide: Nova3SpeechService, useValue: nova },
      { provide: SpeechService, useValue: { isListening: () => false } },
    ] });
    const lab = TestBed.runInInjectionContext(() => new SpeechLabComponent());
    lab.consent.setValue(true);
    lab.reference.setValue('I like science');
    lab.startNova();
    await lab.stopNova();
    expect(lab.runs()[0].transcript).toBe('I like science');
    expect(lab.runs()[0].wer).toBe(0);
    expect(lab.runs()[0].provisionalAtStop).toBe(true);
  });
});
