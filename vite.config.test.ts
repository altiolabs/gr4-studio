import { describe, expect, it } from 'vitest';
import { buildProxyRequestHeaders } from './vite.config';

describe('buildProxyRequestHeaders', () => {
  it('sets content length for buffered json post bodies', () => {
    const body = Buffer.from('{"name":"demo","grc":"graph"}', 'utf8');

    expect(
      buildProxyRequestHeaders(
        {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body,
      ),
    ).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
    });
  });

  it('omits content length when there is no request body', () => {
    expect(
      buildProxyRequestHeaders({
        accept: 'application/json',
      }),
    ).toEqual({
      Accept: 'application/json',
    });
  });
});
