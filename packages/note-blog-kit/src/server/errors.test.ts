import { describe, expect, it } from 'vitest';
import {
  isNoteError,
  NoteError,
  NoteHttpError,
  NoteNetworkError,
  NoteNotFoundError,
  NoteRateLimitError,
  NoteSchemaError,
  NoteTimeoutError,
  withUrl,
} from './errors.js';

describe('errors', () => {
  it('各エラーは NoteError を継承し、固定の name と code を持つ', () => {
    const cases = [
      [new NoteNotFoundError('not found', { url: 'https://note.com/x' }), 'NoteNotFoundError', 'NOTE_NOT_FOUND'],
      [new NoteHttpError('bad', { status: 500, url: 'https://note.com/x' }), 'NoteHttpError', 'NOTE_HTTP_ERROR'],
      [new NoteNetworkError('net', { url: 'https://note.com/x' }), 'NoteNetworkError', 'NOTE_NETWORK_ERROR'],
      [new NoteTimeoutError('timeout', { url: 'https://note.com/x' }), 'NoteTimeoutError', 'NOTE_TIMEOUT'],
      [new NoteSchemaError('schema', { issues: [] }), 'NoteSchemaError', 'NOTE_SCHEMA_ERROR'],
      [
        new NoteRateLimitError('rate', { url: 'https://note.com/x', retryAfterSeconds: 30 }),
        'NoteRateLimitError',
        'NOTE_RATE_LIMITED',
      ],
    ] as const;
    for (const [error, name, code] of cases) {
      expect(error).toBeInstanceOf(NoteError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.code).toBe(code);
      expect(isNoteError(error)).toBe(true);
    }
  });

  it('NoteNotFoundError は url を持つ', () => {
    expect(new NoteNotFoundError('not found', { url: 'https://note.com/x' }).url).toBe('https://note.com/x');
  });

  it('NoteHttpError は status と url を持つ', () => {
    const error = new NoteHttpError('bad', { status: 503, url: 'https://note.com/x' });
    expect(error.status).toBe(503);
    expect(error.url).toBe('https://note.com/x');
  });

  it('cause を保持する', () => {
    const cause = new TypeError('fetch failed');
    expect(new NoteNetworkError('net', { url: 'https://note.com/x', cause }).cause).toBe(cause);
  });

  it('どのエラーも url を持つ（NoteSchemaError は取得関数から投げられるときに入る）', () => {
    expect(new NoteNetworkError('net', { url: 'https://note.com/x' }).url).toBe('https://note.com/x');
    expect(new NoteTimeoutError('t', { url: 'https://note.com/x' }).url).toBe('https://note.com/x');
    expect(new NoteSchemaError('s', { issues: [], url: 'https://note.com/x' }).url).toBe('https://note.com/x');
    expect(new NoteSchemaError('s', { issues: [] }).url).toBeNull();
    const rate = new NoteRateLimitError('r', { url: 'https://note.com/x', retryAfterSeconds: null });
    expect(rate.url).toBe('https://note.com/x');
    expect(rate.retryAfterSeconds).toBeNull();
  });

  it('NoteSchemaError は issues を持ち、メッセージにパスを含む', () => {
    const issues = [{ path: 'data.contents.0.key', message: 'Required' }];
    const error = new NoteSchemaError('Unexpected response shape', { issues });
    expect(error.issues).toEqual(issues);
    expect(error.message).toContain('data.contents.0.key');
  });

  it('isNoteError は code で判定する（別のコピー由来のエラーも判定できる）', () => {
    const foreign = Object.assign(new Error('x'), { name: 'NoteError', code: 'NOTE_TIMEOUT' });
    expect(isNoteError(foreign)).toBe(true);
    expect(isNoteError(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toBe(false);
    expect(isNoteError(new Error('x'))).toBe(false);
    expect(isNoteError({ code: 'NOTE_TIMEOUT' })).toBe(false);
    // 別の realm（vm など）由来で Error を継承していなくても、name・message・code があれば判定できる
    expect(isNoteError({ name: 'NoteTimeoutError', message: 'x', code: 'NOTE_TIMEOUT' })).toBe(true);
    expect(isNoteError('NOTE_TIMEOUT')).toBe(false);
    expect(isNoteError(null)).toBe(false);
  });

  it('withUrl は url のない NoteSchemaError にだけ url を付け、既にある url は上書きしない', () => {
    const missing = new NoteSchemaError('s', { issues: [] });
    expect(withUrl(missing, 'https://note.com/a')).toBe(missing);
    expect(missing.url).toBe('https://note.com/a');
    const present = new NoteSchemaError('s', { issues: [], url: 'https://note.com/b' });
    withUrl(present, 'https://note.com/c');
    expect(present.url).toBe('https://note.com/b');
    const other = new Error('x');
    expect(withUrl(other, 'https://note.com/d')).toBe(other);
  });
});
