import { describe, expect, it, vi } from 'vitest';
import { run } from './run.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
}

describe('cli run', () => {
  it('コマンドなし・--help では使い方を表示して 0 を返す', async () => {
    for (const argv of [[], ['--help'], ['-h']]) {
      const { out, deps } = capture();
      expect(await run(argv, deps)).toBe(0);
      expect(out.join('\n')).toContain('sync');
    }
  });

  it('sync に必要な引数がなければ 2 を返し、取得しない', async () => {
    const fetch = vi.fn();
    const { err, deps } = capture();
    expect(await run(['sync'], { ...deps, fetch })).toBe(2);
    expect(err.join('\n')).toContain('--user');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('不明なコマンドは 2 を返す', async () => {
    const { err, deps } = capture();
    expect(await run(['unknown'], deps)).toBe(2);
    expect(err.join('\n')).toContain('unknown');
  });
});
