import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileName, _resetFileCache } from './files';

afterEach(() => { _resetFileCache(); vi.unstubAllGlobals(); });

describe('fileName', () => {
  it('fetches once per id and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ filename: 'MSA.pdf' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fileName('abc')).toBe('MSA.pdf');
    expect(await fileName('abc')).toBe('MSA.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/files/abc');
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    expect(await fileName('missing')).toBeNull();
  });
});
