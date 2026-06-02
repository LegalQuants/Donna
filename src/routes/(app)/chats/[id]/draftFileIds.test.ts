import { describe, it, expect } from 'vitest';
import { parseDraftFileIds } from './draftFileIds';

describe('parseDraftFileIds', () => {
  it('parses a JSON array of ids', () => {
    expect(parseDraftFileIds('["f1","f2"]')).toEqual(['f1', 'f2']);
  });
  it('returns [] for null/undefined/empty', () => {
    expect(parseDraftFileIds(null)).toEqual([]);
    expect(parseDraftFileIds(undefined)).toEqual([]);
    expect(parseDraftFileIds('')).toEqual([]);
  });
  it('returns [] for malformed JSON', () => {
    expect(parseDraftFileIds('not json')).toEqual([]);
  });
  it('drops non-string and empty entries', () => {
    expect(parseDraftFileIds('["a",1,null,"","b"]')).toEqual(['a', 'b']);
  });
  it('returns [] when the JSON is not an array', () => {
    expect(parseDraftFileIds('{"a":1}')).toEqual([]);
  });
});
