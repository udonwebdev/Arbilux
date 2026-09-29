export class CircuitBreaker {
  private consecutiveFailures: number = 0;
  private readonly maxConsecutiveFailures: number;
  private readonly cooldownPeriodMs: number;
  private tripped: boolean = false;
  private trippedAt: number = 0;

  constructor(maxFailures = 3, cooldownMs = 60_000) {
    this.maxConsecutiveFailures = maxFailures;
    this.cooldownPeriodMs = cooldownMs;
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  public recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.trip();
    }
  }

  private trip(): void {
    this.tripped = true;
    this.trippedAt = Date.now();
    console.error(
      `[CIRCUIT BREAKER TRIPPED] ${this.consecutiveFailures} consecutive simulation/execution faults. Pausing engine for ${this.cooldownPeriodMs / 1000}s.`
    );
  }

  public canExecute(): boolean {
    if (!this.tripped) return true;

    const now = Date.now();
    if (now - this.trippedAt > this.cooldownPeriodMs) {
      console.log('[CIRCUIT BREAKER] Cooldown expired. Resuming speculative scanning...');
      this.tripped = false;
      this.consecutiveFailures = 0;
      return true;
    }

    return false;
  }
}
