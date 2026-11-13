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
  return formatter.format(new Date(iso));
}
