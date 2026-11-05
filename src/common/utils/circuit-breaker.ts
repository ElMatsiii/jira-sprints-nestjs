export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  callTimeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly callTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 10000;
    this.callTimeoutMs = options.callTimeoutMs ?? 5000;
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
      }
    }
    return this.state;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();
    if (currentState === CircuitState.OPEN) {
      throw new Error('Circuit breaker is OPEN: External service is temporarily unavailable');
    }

    let timer: NodeJS.Timeout | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Call deadline exceeded')), this.callTimeoutMs);
      });

      const result = await Promise.race([action(), timeoutPromise]);
      if (timer) clearTimeout(timer);
      this.onSuccess();
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      this.onFailure();
      throw err;
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = CircuitState.CLOSED;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
}
