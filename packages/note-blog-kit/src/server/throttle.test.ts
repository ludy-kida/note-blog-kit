import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottle } from './throttle.js';

describe('createThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('初回は待たない', async () => {
    const throttle = createThrottle();
    const done = vi.fn();
    void throttle(1000).then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });

  it('前回から minIntervalMs 経つまで待つ', async () => {
    const throttle = createThrottle();
    await throttle(1000);
    const done = vi.fn();
    void throttle(1000).then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('十分に時間が経っていれば待たない', async () => {
    const throttle = createThrottle();
    await throttle(1000);
    await vi.advanceTimersByTimeAsync(5000);
    const done = vi.fn();
    void throttle(1000).then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });

  it('minIntervalMs が 0 なら待たない', async () => {
    const throttle = createThrottle();
    await throttle(0);
    const done = vi.fn();
    void throttle(0).then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });

  it('並行呼び出しは間隔を空けて直列に通す', async () => {
    const throttle = createThrottle();
    const times: number[] = [];
    const calls = [1, 2, 3].map(() => throttle(1000).then(() => times.push(Date.now())));
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(calls);
    expect(times).toEqual([0, 1000, 2000]);
  });
});
