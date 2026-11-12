import { describe, expect, it } from 'vitest';
import { NoteError, NoteSchemaError } from './errors.js';

describe('errors', () => {
  it('NoteSchemaError は NoteError と Error を継承し、issues を持つ', () => {
    const issues = [{ path: 'data.contents.0.key', message: 'Required' }];
    const error = new NoteSchemaError('レスポンスの形が想定と違います', issues);
    expect(error).toBeInstanceOf(NoteSchemaError);
    expect(error).toBeInstanceOf(NoteError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('NoteSchemaError');
    expect(error.issues).toEqual(issues);
    expect(error.message).toContain('data.contents.0.key');
  });

  it('NoteError の name', () => {
    expect(new NoteError('x').name).toBe('NoteError');
  });
});
