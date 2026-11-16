/** 取得関数に共通するオプションの既定値と検証（内部用） */

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MIN_INTERVAL_MS = 1_000;
/** setTimeout が扱える上限（これを超えると約 1ms に丸められ、待たなくなる） */
const MAX_TIMER_MS = 2 ** 31 - 1;

export function assertMilliseconds(name: string, value: number, min: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > MAX_TIMER_MS) {
    throw new TypeError(`${name} must be a finite number between ${min} and ${MAX_TIMER_MS}: ${String(value)}`);
  }
}
