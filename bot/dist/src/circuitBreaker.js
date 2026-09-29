export class CircuitBreaker {
    consecutiveFailures = 0;
    maxConsecutiveFailures;
    cooldownPeriodMs;
    tripped = false;
    trippedAt = 0;
    constructor(maxFailures = 3, cooldownMs = 60_000) {
        this.maxConsecutiveFailures = maxFailures;
        this.cooldownPeriodMs = cooldownMs;
    }
    recordSuccess() {
        this.consecutiveFailures = 0;
    }
    recordFailure() {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.trip();
        }
    }
    trip() {
        this.tripped = true;
        this.trippedAt = Date.now();
        console.error(`[CIRCUIT BREAKER TRIPPED] ${this.consecutiveFailures} consecutive simulation/execution faults. Pausing engine for ${this.cooldownPeriodMs / 1000}s.`);
    }
    canExecute() {
        if (!this.tripped)
            return true;
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
