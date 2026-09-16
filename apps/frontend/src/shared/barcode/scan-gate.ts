/** A visible barcode must leave the frame before it can count again. */
export class ScanGate {
  private seen = new Map<string, number>();
  private accepted = new Map<string, number>();
  constructor(private cooldownMs = 1200, private leaveMs = 600) {}
  accept(raw: string, now: number): boolean {
    const value = raw.trim();
    if (!value || value.length > 80) return false;
    const seen = this.seen.get(value), accepted = this.accepted.get(value);
    this.seen.set(value, now);
    for (const [key, time] of this.seen) if (now - time > 60_000) { this.seen.delete(key); this.accepted.delete(key); }
    if ((seen !== undefined && now - seen < this.leaveMs) || (accepted !== undefined && now - accepted < this.cooldownMs)) return false;
    this.accepted.set(value, now);
    return true;
  }
}
