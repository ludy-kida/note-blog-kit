export interface CodeExample {
  /** コードの言語（ts か tsx） */
  lang: 'ts' | 'tsx';
  /** README の中で、コードの1行目がある行番号（1 から） */
  line: number;
  /** コード（各行の末尾に改行） */
  code: string;
}
/** README から型チェックする ts・tsx のブロックを取り出す（情報文字列に nocheck が付いたものは除く） */
export declare function extractCodeExamples(readme: string): CodeExample[];
