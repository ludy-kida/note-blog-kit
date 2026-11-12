/** note-blog-kit が投げるエラーの基底クラス */
export class NoteError extends Error {
  // 利用者側のバンドラがクラス名を圧縮しても変わらないよう、name は文字列で持つ
  override name: string = 'NoteError';
}

/** レスポンスのどこが想定と違ったか（デバッグ用。中身の文言は互換性の対象外） */
export interface NoteSchemaIssue {
  /** `data.contents.0.key` のようなドット区切りのパス */
  readonly path: string;
  readonly message: string;
}

/** note のレスポンスの形が想定と違う（API の仕様変更など） */
export class NoteSchemaError extends NoteError {
  override name = 'NoteSchemaError';
  readonly issues: readonly NoteSchemaIssue[];

  constructor(message: string, issues: readonly NoteSchemaIssue[], options?: ErrorOptions) {
    const detail = issues
      .slice(0, 5)
      .map((issue) => `${issue.path || '(root)'}: ${issue.message}`)
      .join('; ');
    super(detail === '' ? message : `${message}（${detail}）`, options);
    this.issues = issues;
  }
}
