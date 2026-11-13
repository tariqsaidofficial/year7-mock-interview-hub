import { describe, expect, it } from 'vitest';
import { NovaTranscript } from './nova3-transcript';

describe('Nova-3 transcript assembly', () => {
  it('keeps confirmed words across interim revisions, pauses and reconnects', () => {
    const state = new NovaTranscript(); state.nextStream();
    state.receive({ type: 'Results', start: 0, duration: 1, is_final: false, channel: { alternatives: [{ transcript: 'I used' }] } });
    expect(state.finalText).toBe(''); expect(state.provisionalText).toBe('I used');
    state.receive({ type: 'Results', start: 0, duration: 1, is_final: true, channel: { alternatives: [{ transcript: 'I used a planner.' }] } });
    state.receive({ type: 'Results', start: 0, duration: 1, is_final: true, channel: { alternatives: [{ transcript: 'I used a planner.' }] } });
    expect(state.finalText).toBe('I used a planner.'); expect(state.finalCount).toBe(1);
    state.receive({ type: 'Results', start: 1, duration: 1, is_final: false, channel: { alternatives: [{ transcript: 'Then I' }] } });
    state.nextStream();
    expect(state.finalText).toBe('I used a planner.'); expect(state.provisionalText).toBe('');
    state.receive({ type: 'Results', start: 0, duration: 1, is_final: true, channel: { alternatives: [{ transcript: 'Then I asked for help.' }] } });
    expect(state.visibleText).toBe('I used a planner. Then I asked for help.');
  });
});
