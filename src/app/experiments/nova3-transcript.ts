export interface NovaResult {
  type?: string;
  start?: number;
  duration?: number;
  is_final?: boolean;
  from_finalize?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
}

export class NovaTranscript {
  private confirmed: string[] = [];
  private seen = new Set<string>();
  private interim = '';
  private stream = 0;
  firstFinalAt: number | null = null;
  finalCount = 0;

  nextStream() { this.stream++; this.interim = ''; }
  receive(result: NovaResult, now = Date.now()) {
    if (result.type !== 'Results') return false;
    const text = result.channel?.alternatives?.[0]?.transcript?.trim() || '';
    if (result.is_final) {
      const key = `${this.stream}:${result.start ?? ''}:${result.duration ?? ''}`;
      if (text && !this.seen.has(key)) {
        this.seen.add(key);
        this.confirmed.push(text);
        this.finalCount++;
        this.firstFinalAt ??= now;
      }
      this.interim = '';
    } else this.interim = text;
    return true;
  }
  get finalText() { return this.confirmed.join(' ').trim(); }
  get provisionalText() { return this.interim; }
  get visibleText() { return [this.finalText, this.interim].filter(Boolean).join(' '); }
  get hasProvisional() { return !!this.interim; }
}
