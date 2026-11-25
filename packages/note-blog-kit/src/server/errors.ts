/**
 * エラーの種類を表す安定した識別子。
 *
 * マイナーバージョンでコードが増えることがある。
 * `switch (error.code)` で分けるときは、知らないコードのために `default` を書くこと。
 */
export type NoteErrorCode =
  | 'NOTE_NOT_FOUND'
  | 'NOTE_HTTP_ERROR'
  | 'NOTE_RATE_LIMITED'
  | 'NOTE_NETWORK_ERROR'
  | 'NOTE_TIMEOUT'
  | 'NOTE_SCHEMA_ERROR';

const NOTE_ERROR_CODES: ReadonlySet<string> = new Set<NoteErrorCode>([
  'NOTE_NOT_FOUND',
  'NOTE_HTTP_ERROR',
  'NOTE_RATE_LIMITED',
  'NOTE_NETWORK_ERROR',
  'NOTE_TIMEOUT',
  'NOTE_SCHEMA_ERROR',
]);

function toErrorOptions(options: { cause?: unknown } | undefined): ErrorOptions | undefined {
  return options !== undefined && 'cause' in options ? { cause: options.cause } : undefined;
}

/**
 * note-blog-kit/server が投げるエラーの基底クラス。
 *
 * 判定は `instanceof` ではなく {@link isNoteError} と `code` で行うことを推奨する
 * （パッケージが重複して読み込まれたり、別の realm 由来だったりすると `instanceof` は一致しないことがある）。
 * `isNoteError(error) && error.code === 'NOTE_HTTP_ERROR'` のように書くと `error.status` まで型が絞られる。
 *
 * コンストラクタはライブラリ内部で使うもので、利用者が作ることは想定していない（引数は予告なく変わる）。
 */
export class NoteError extends Error {
  // 利用者側のバンドラがクラス名を圧縮しても変わらないよう、name は文字列で持つ
  override name: string = 'NoteError';
  /** エラーの種類 */
  readonly code: NoteErrorCode;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; code: NoteErrorCode }) {
    super(message, toErrorOptions(options));
    this.code = options.code;
  }
}

/** ユーザーや記事が見つからない（HTTP 404）、または `getArticle` の `user` にない著者の記事 */
export class NoteNotFoundError extends NoteError {
  override name = 'NoteNotFoundError';
  override readonly code = 'NOTE_NOT_FOUND' as const;
  /** リクエストした URL */
  readonly url: string;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; url: string }) {
    super(message, { ...options, code: 'NOTE_NOT_FOUND' });
    this.url = options.url;
  }
}

/** 404・429 以外の 2xx でない HTTP ステータス */
export class NoteHttpError extends NoteError {
  override name = 'NoteHttpError';
  override readonly code = 'NOTE_HTTP_ERROR' as const;
  /** HTTP ステータス */
  readonly status: number;
  /** リクエストした URL */
  readonly url: string;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; status: number; url: string }) {
    super(message, { ...options, code: 'NOTE_HTTP_ERROR' });
    this.status = options.status;
    this.url = options.url;
  }
}

/** リクエストが多すぎる（HTTP 429）。時間を空けて再試行すること */
export class NoteRateLimitError extends NoteError {
  override name = 'NoteRateLimitError';
  override readonly code = 'NOTE_RATE_LIMITED' as const;
  /** リクエストした URL */
  readonly url: string;
  /**
   * 応答の `Retry-After` から求めた、再試行まで待つ秒数（0〜86400。1日を超える値は 86400 にする）。
   * なければ・解釈できなければ null
   */
  readonly retryAfterSeconds: number | null;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; url: string; retryAfterSeconds: number | null }) {
    super(message, { ...options, code: 'NOTE_RATE_LIMITED' });
    this.url = options.url;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** 通信そのものの失敗（DNS・接続断・リダイレクトの拒否など） */
export class NoteNetworkError extends NoteError {
  override name = 'NoteNetworkError';
  override readonly code = 'NOTE_NETWORK_ERROR' as const;
  /** リクエストした URL */
  readonly url: string;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; url: string }) {
    super(message, { ...options, code: 'NOTE_NETWORK_ERROR' });
    this.url = options.url;
  }
}

/** 応答がタイムアウトまでに返らなかった */
export class NoteTimeoutError extends NoteError {
  override name = 'NoteTimeoutError';
  override readonly code = 'NOTE_TIMEOUT' as const;
  /** リクエストした URL */
  readonly url: string;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; url: string }) {
    super(message, { ...options, code: 'NOTE_TIMEOUT' });
    this.url = options.url;
  }
}

/** レスポンスのどこが想定と違ったか（デバッグ用。文言は互換性の対象外） */
export interface NoteSchemaIssue {
  /** `data.contents.0.key` のようなドット区切りのパス */
  readonly path: string;
  /** 何が違ったか */
  readonly message: string;
}

/** note のレスポンスの形が想定と違う（API の仕様変更など）、または本文が大きすぎる */
export class NoteSchemaError extends NoteError {
  override name = 'NoteSchemaError';
  override readonly code = 'NOTE_SCHEMA_ERROR' as const;
  /** 想定と違った箇所 */
  readonly issues: readonly NoteSchemaIssue[];
  /** リクエストした URL。取得関数（`listArticles`・`getArticle` など）から投げられるときは必ず入る */
  readonly url: string | null;

  /** @internal */
  constructor(message: string, options: { cause?: unknown; issues: readonly NoteSchemaIssue[]; url?: string }) {
    const detail = options.issues
      .slice(0, 5)
      .map((issue) => `${issue.path || '(root)'}: ${issue.message}`)
      .join('; ');
    super(detail === '' ? message : `${message} (${detail})`, { ...options, code: 'NOTE_SCHEMA_ERROR' });
    this.issues = options.issues;
    this.url = options.url ?? null;
  }
}

/**
 * 正規化で投げられた NoteSchemaError に、リクエストした URL を付ける（内部用）。
 * 正規化の関数は URL を知らないため、取得関数がここで付け直す。
 */
export function withUrl(error: unknown, url: string): unknown {
  if (error instanceof NoteSchemaError && error.url === null) {
    (error as { url: string | null }).url = url;
  }
  return error;
}

/**
 * note-blog-kit/server が投げるエラーのいずれか。`code` で判別できる。
 * {@link NoteErrorCode} と同じく、マイナーバージョンで種類が増えることがある。
 */
export type AnyNoteError =
  | NoteNotFoundError
  | NoteHttpError
  | NoteRateLimitError
  | NoteNetworkError
  | NoteTimeoutError
  | NoteSchemaError;

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
