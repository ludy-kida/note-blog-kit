import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from './run.js';

describe('cli run', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('コマンドなしでは使い方を表示して 0 を返す', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(run([])).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('sync'));
  });

  it('未実装の sync は 1 を返す', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(run(['sync'])).toBe(1);
  });

  it('不明なコマンドは 2 を返す', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(run(['unknown'])).toBe(2);
  });
});
