/**
 * 既定の日付表示（YYYY/MM/DD）。
 * サーバーとブラウザでタイムゾーンが違っても表示がずれないよう（hydration の不一致を避けるため）、Asia/Tokyo に固定する。
 */
const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  // 日時として解釈できない値でも、一覧全体の描画を失敗させずにそのまま表示する
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date);
}
