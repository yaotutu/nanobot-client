export class VoiceRecorderTimers {
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private noInputTimer: ReturnType<typeof setTimeout> | null = null;

  start(options: {
    maxDurationMs: number;
    noInputHintMs: number;
    onMaxDuration: () => void;
    onNoInputHint: () => void;
  }): void {
    this.clear();
    this.maxTimer = setTimeout(options.onMaxDuration, options.maxDurationMs);
    this.noInputTimer = setTimeout(options.onNoInputHint, options.noInputHintMs);
  }

  clear(): void {
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.noInputTimer) clearTimeout(this.noInputTimer);
    this.maxTimer = null;
    this.noInputTimer = null;
  }
}
