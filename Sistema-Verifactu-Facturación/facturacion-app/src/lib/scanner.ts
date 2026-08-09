export const SCANNER_BURST_MS = 60;
export const SCANNER_PAUSE_FLUSH_MS = 180;
export const SCANNER_MIN_LEN = 3;
export const SCANNER_MAX_LEN = 64;
export const SCANNER_PAUSE_FLUSH_MIN_LEN = 6;

export function isTextEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function isPrintableCharKey(key: string): boolean {
  return key.length === 1 && key !== ' ';
}

export interface BarcodeAccumulatorConfig {
  burstMs?: number;
  maxLen?: number;
}

export class BarcodeAccumulator {
  private buffer = '';
  private lastCharAt = 0;
  private burstMs: number;
  private maxLen: number;

  constructor(config: BarcodeAccumulatorConfig = {}) {
    this.burstMs = config.burstMs ?? SCANNER_BURST_MS;
    this.maxLen = config.maxLen ?? SCANNER_MAX_LEN;
  }

  get isScanning(): boolean {
    return this.buffer.length > 0;
  }

  get length(): number {
    return this.buffer.length;
  }

  get code(): string {
    return this.buffer;
  }

  push(char: string, now: number): void {
    if (this.buffer.length > 0 && now - this.lastCharAt > this.burstMs) {
      this.buffer = '';
    }
    if (this.buffer.length >= this.maxLen) {
      this.buffer = '';
    }
    this.buffer += char;
    this.lastCharAt = now;
  }

  isIdleLongEnough(now: number, minLen: number = SCANNER_PAUSE_FLUSH_MIN_LEN): boolean {
    return this.buffer.length >= minLen && now - this.lastCharAt >= SCANNER_PAUSE_FLUSH_MS;
  }

  flush(): string {
    const code = this.buffer;
    this.buffer = '';
    this.lastCharAt = 0;
    return code;
  }

  reset(): void {
    this.buffer = '';
    this.lastCharAt = 0;
  }
}
