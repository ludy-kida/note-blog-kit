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

  it('待っている間に中断されたら、すぐにその理由で reject し、送信として数えない', async () => {
    const throttle = createThrottle();
    await throttle(1000);
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const waiting = throttle(1000, controller.signal).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(reason);
    expect(await waiting).toBe(reason);
    // 中断した呼び出しは送信時刻を更新しないので、次は最初の送信から 1000ms 後に通る
    const done = vi.fn();
    void throttle(1000).then(done);
    await vi.advanceTimersByTimeAsync(899);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('既定の制限は globalThis で共有され、モジュールを読み込み直しても1つ', async () => {
    const first = await import('./throttle.js');
    vi.resetModules();
    const second = await import('./throttle.js');
    expect(second.getDefaultThrottle()).toBe(first.getDefaultThrottle());
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
