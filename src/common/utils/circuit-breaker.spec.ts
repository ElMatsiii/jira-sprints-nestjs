import { CircuitBreaker, CircuitState } from './circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('should execute successfully when state is CLOSED', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const result = await cb.execute(async () => 'success');
    expect(result).toBe('success');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should trip to OPEN after reaching failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, callTimeoutMs: 1000 });

    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Immediate fast-fail without calling action
    const mockAction = jest.fn();
    await expect(cb.execute(mockAction)).rejects.toThrow('Circuit breaker is OPEN');
    expect(mockAction).not.toHaveBeenCalled();
  });

  it('should transition to HALF_OPEN after recoveryTimeoutMs', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 50, callTimeoutMs: 1000 });

    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    expect(cb.getState()).toBe(CircuitState.OPEN);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it('should reset back to CLOSED on manual reset', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should reject when action exceeds callTimeoutMs', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5, callTimeoutMs: 50 });
    await expect(
      cb.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'late';
      }),
    ).rejects.toThrow('Call deadline exceeded');
  });
});
