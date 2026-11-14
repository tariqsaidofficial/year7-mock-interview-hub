// Local adult-consented speech experiment. Audio is sent directly to the active WebSocket.
class Nova3PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(2048);
    this.count = 0;
    this.levelSum = 0;
    this.levelCount = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'flush') return;
      this.flush();
      // Port messages are ordered: the main thread receives any final PCM packet first.
      this.port.postMessage({ type: 'flushed', id: event.data.id });
    };
  }
  flush() {
    if (!this.count) return;
    const packet = this.samples.slice(0, this.count);
    this.port.postMessage(packet.buffer, [packet.buffer]);
    this.count = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const mono = channels[0];
    for (let i = 0; i < mono.length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] || 0;
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      this.levelSum += sample * sample;
      this.levelCount++;
      if (this.levelCount >= 2048) {
        this.port.postMessage({ type: 'level', value: Math.sqrt(this.levelSum / this.levelCount) });
        this.levelSum = 0;
        this.levelCount = 0;
      }
      this.samples[this.count++] = sample < 0 ? sample * 32768 : sample * 32767;
      if (this.count === this.samples.length) this.flush();
    }
    return true;
  }
}
registerProcessor('nova3-pcm', Nova3PcmProcessor);
