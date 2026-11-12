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

/** エラーのコンストラクタに渡す共通のオプション（ライブラリ内部用） */
export interface NoteErrorOptions {
  /** 元になったエラー */
  cause?: unknown;
}

function toErrorOptions(options: NoteErrorOptions | undefined): ErrorOptions | undefined {
  return options !== undefined && 'cause' in options ? { cause: options.cause } : undefined;
}

/**
 * note-blog-kit/server が投げるエラーの基底クラス。
 *
 * 判定は `instanceof` ではなく {@link isNoteError} と `code` で行うことを推奨する
 * （ESM と CJS が混在したり、パッケージが重複して読み込まれたりすると `instanceof` は一致しないことがある）。
 * `isNoteError(error) && error.code === 'NOTE_HTTP_ERROR'` のように書くと `error.status` まで型が絞られる。
 *
 * コンストラクタはライブラリ内部で使うもので、利用者が作ることは想定していない。
 */
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
  override readonly code = 'NOTE_NOT_FOUND' as const;
  /** リクエストした URL */
  readonly url: string;

  constructor(message: string, options: NoteErrorOptions & { url: string }) {
    super(message, { ...options, code: 'NOTE_NOT_FOUND' });
    this.url = options.url;
  }
}

/** 404 以外の 2xx でない HTTP ステータス */
export class NoteHttpError extends NoteError {
  override name = 'NoteHttpError';
  override readonly code = 'NOTE_HTTP_ERROR' as const;
  readonly status: number;
  /** リクエストした URL */
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
  override readonly code = 'NOTE_NETWORK_ERROR' as const;

  constructor(message: string, options?: NoteErrorOptions) {
    super(message, { ...options, code: 'NOTE_NETWORK_ERROR' });
  }
}

/** 応答がタイムアウトまでに返らなかった */
export class NoteTimeoutError extends NoteError {
  override name = 'NoteTimeoutError';
  override readonly code = 'NOTE_TIMEOUT' as const;

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
  override readonly code = 'NOTE_SCHEMA_ERROR' as const;
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

/** note-blog-kit/server が投げるエラーのいずれか。`code` で判別できる */
export type AnyNoteError = NoteNotFoundError | NoteHttpError | NoteNetworkError | NoteTimeoutError | NoteSchemaError;

/**
 * note-blog-kit のエラーかどうかを `name`・`message`・`code` で判定する。
 * パッケージの重複や別の realm（vm など）由来で `instanceof` が一致しない場合でも判定できる。
 */
export function isNoteError(value: unknown): value is AnyNoteError {
  if (typeof value !== 'object' || value === null) return false;
  const { name, message, code } = value as { name?: unknown; message?: unknown; code?: unknown };
  return (
    typeof name === 'string' && typeof message === 'string' && typeof code === 'string' && NOTE_ERROR_CODES.has(code)
  );
}
