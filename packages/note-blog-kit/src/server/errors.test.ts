import { describe, expect, it } from 'vitest';
import {
  isNoteError,
  NoteError,
  NoteHttpError,
  NoteNetworkError,
  NoteNotFoundError,
  NoteSchemaError,
  NoteTimeoutError,
} from './errors.js';

describe('errors', () => {
  it('各エラーは NoteError を継承し、固定の name と code を持つ', () => {
    const cases = [
      [new NoteNotFoundError('not found'), 'NoteNotFoundError', 'NOTE_NOT_FOUND'],
      [new NoteHttpError('bad', { status: 500, url: 'https://note.com/x' }), 'NoteHttpError', 'NOTE_HTTP_ERROR'],
      [new NoteNetworkError('net'), 'NoteNetworkError', 'NOTE_NETWORK_ERROR'],
      [new NoteTimeoutError('timeout'), 'NoteTimeoutError', 'NOTE_TIMEOUT'],
      [new NoteSchemaError('schema', { issues: [] }), 'NoteSchemaError', 'NOTE_SCHEMA_ERROR'],
    ] as const;
    for (const [error, name, code] of cases) {
      expect(error).toBeInstanceOf(NoteError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.code).toBe(code);
      expect(isNoteError(error)).toBe(true);
    }
  });

  it('NoteHttpError は status と url を持つ', () => {
    const error = new NoteHttpError('bad', { status: 503, url: 'https://note.com/x' });
    expect(error.status).toBe(503);
    expect(error.url).toBe('https://note.com/x');
  });

  it('cause を保持する', () => {
    const cause = new TypeError('fetch failed');
    expect(new NoteNetworkError('net', { cause }).cause).toBe(cause);
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
    expect(isNoteError('NOTE_TIMEOUT')).toBe(false);
    expect(isNoteError(null)).toBe(false);
  });
});
