/** CLI の差し替え（テスト用。CLI の引数からは変えられない） */
export interface CliDeps {
  fetch?: typeof globalThis.fetch;
  minIntervalMs?: number;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}
