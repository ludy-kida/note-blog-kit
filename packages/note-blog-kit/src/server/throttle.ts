/**
 * 取得間隔の制限。前回の送信から minIntervalMs 経つまで待ってから通す。
 * 並行して呼ばれても1件ずつ順番に通す（Promise の鎖で直列化）。
 */
export type Throttle = (minIntervalMs: number, signal?: AbortSignal) => Promise<void>;

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createThrottle(): Throttle {
  let tail: Promise<void> = Promise.resolve();
  let lastSentAt: number | undefined;

  return (minIntervalMs, signal) => {
    const turn = tail.then(async () => {
      if (lastSentAt !== undefined) {
        const wait = lastSentAt + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait, signal);
      }
      // 待っている間に中断された呼び出しは送信しないので、送信時刻として数えない
      signal?.throwIfAborted();
      lastSentAt = Date.now();
    });
    // 中断で reject しても、後ろに並んだ呼び出しの鎖は止めない
    tail = turn.catch(() => {});
    return turn;
  };
}

const GLOBAL_KEY = Symbol.for('note-blog-kit.throttle');

/**
 * プロセス全体で共有する既定の制限。
 * entry ごとのバンドル・ESM と CJS の併用・パッケージの重複があっても1つになるよう、globalThis に置く。
 */
export function getDefaultThrottle(): Throttle {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Throttle };
  store[GLOBAL_KEY] ??= createThrottle();
  return store[GLOBAL_KEY];
}
