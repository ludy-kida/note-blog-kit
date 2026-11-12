/**
 * 取得間隔の制限。前回の送信から minIntervalMs 経つまで待ってから通す。
 * 並行して呼ばれても1件ずつ順番に通す（Promise の鎖で直列化）。
 */
export type Throttle = (minIntervalMs: number) => Promise<void>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createThrottle(): Throttle {
  let tail: Promise<void> = Promise.resolve();
  let lastSentAt: number | undefined;

  return (minIntervalMs) => {
    const turn = tail.then(async () => {
      if (lastSentAt !== undefined) {
        const wait = lastSentAt + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
      }
      lastSentAt = Date.now();
    });
    tail = turn;
    return turn;
  };
}

/** プロセス全体で共有する既定の制限 */
export const defaultThrottle: Throttle = createThrottle();
