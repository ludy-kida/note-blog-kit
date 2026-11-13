/** 既定のクラス名に利用者のクラス名を追加する（空の値は除く） */
export function classNames(...names: (string | undefined | false)[]): string {
  return names.filter((name) => typeof name === 'string' && name !== '').join(' ');
}
