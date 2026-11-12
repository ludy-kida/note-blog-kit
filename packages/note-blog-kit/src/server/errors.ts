/**
 * note-blog-kit/server が投げるエラー。
 *
 * 判定は `instanceof` ではなく `code`（または {@link isNoteError}）で行うことを推奨する。
 * ESM と CJS が混在したり、パッケージが重複して読み込まれたりすると、`instanceof` は一致しないことがある。
 * コンストラクタはライブラリ内部で使うもので、利用者が作ることは想定していない。
 */

/** エラーの種類を表す安定した識別子 */
export type NoteErrorCode =
  | 'NOTE_NOT_FOUND'
  | 'NOTE_HTTP_ERROR'
  | 'NOTE_NETWORK_ERROR'
  | 'NOTE_TIMEOUT'
  | 'NOTE_SCHEMA_ERROR';

const NOTE_ERROR_CODES: ReadonlySet<string> = new Set<NoteErrorCode>([
  'NOTE_NOT_FOUND',
  'NOTE_HTTP_ERROR',
  'NOTE_NETWORK_ERROR',
  'NOTE_TIMEOUT',
  'NOTE_SCHEMA_ERROR',
]);

export interface NoteErrorOptions {
  cause?: unknown;
}

function toErrorOptions(options: NoteErrorOptions | undefined): ErrorOptions | undefined {
  return options !== undefined && 'cause' in options ? { cause: options.cause } : undefined;
}

/** note-blog-kit が投げるエラーの基底クラス */
export class NoteError extends Error {
  // 利用者側のバンドラがクラス名を圧縮しても変わらないよう、name は文字列で持つ
  override name: string = 'NoteError';
  readonly code: NoteErrorCode;

  constructor(message: string, options: NoteErrorOptions & { code: NoteErrorCode }) {
    super(message, toErrorOptions(options));
    this.code = options.code;
  }
}

/** ユーザーや記事が見つからない（HTTP 404） */
export class NoteNotFoundError extends NoteError {
  override name = 'NoteNotFoundError';

  constructor(message: string, options?: NoteErrorOptions) {
    super(message, { ...options, code: 'NOTE_NOT_FOUND' });
  }
}

/** 404 以外の 2xx でない HTTP ステータス */
export class NoteHttpError extends NoteError {
  override name = 'NoteHttpError';
  readonly status: number;
  readonly url: string;

  constructor(message: string, options: NoteErrorOptions & { status: number; url: string }) {
    super(message, { ...options, code: 'NOTE_HTTP_ERROR' });
    this.status = options.status;
    this.url = options.url;
  }
}

/** 通信そのものの失敗（DNS・接続断・リダイレクトの拒否など） */
export class NoteNetworkError extends NoteError {
  override name = 'NoteNetworkError';

  constructor(message: string, options?: NoteErrorOptions) {
    super(message, { ...options, code: 'NOTE_NETWORK_ERROR' });
  }
}

/** 応答がタイムアウトまでに返らなかった */
export class NoteTimeoutError extends NoteError {
  override name = 'NoteTimeoutError';

  constructor(message: string, options?: NoteErrorOptions) {
    super(message, { ...options, code: 'NOTE_TIMEOUT' });
  }
}

/** レスポンスのどこが想定と違ったか（デバッグ用。文言は互換性の対象外） */
export interface NoteSchemaIssue {
  /** `data.contents.0.key` のようなドット区切りのパス */
  readonly path: string;
  readonly message: string;
}

/** note のレスポンスの形が想定と違う（API の仕様変更など） */
export class NoteSchemaError extends NoteError {
  override name = 'NoteSchemaError';
  readonly issues: readonly NoteSchemaIssue[];

  constructor(message: string, options: NoteErrorOptions & { issues: readonly NoteSchemaIssue[] }) {
    const detail = options.issues
      .slice(0, 5)
      .map((issue) => `${issue.path || '(root)'}: ${issue.message}`)
      .join('; ');
    super(detail === '' ? message : `${message} (${detail})`, { ...options, code: 'NOTE_SCHEMA_ERROR' });
    this.issues = options.issues;
  }
}

/**
 * note-blog-kit のエラーかどうかを `code` で判定する。
 * パッケージが重複して読み込まれ `instanceof` が一致しない場合でも判定できる。
 */
export function isNoteError(value: unknown): value is NoteError {
  if (!(value instanceof Error)) return false;
  const { code } = value as Error & { code?: unknown };
  return typeof code === 'string' && NOTE_ERROR_CODES.has(code);
}
