import { describe, it, expect } from 'vitest';
import { clientIpFromRequest } from './rateLimit';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/test', { headers });
}

describe('clientIpFromRequest', () => {
  it('usa la primera IP de x-forwarded-for si hay varias', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(clientIpFromRequest(req)).toBe('203.0.113.5');
  });

  it('usa x-real-ip si no hay x-forwarded-for', () => {
    const req = makeRequest({ 'x-real-ip': '203.0.113.9' });
    expect(clientIpFromRequest(req)).toBe('203.0.113.9');
  });

  it('devuelve "unknown" si no hay ninguna cabecera', () => {
    const req = makeRequest({});
    expect(clientIpFromRequest(req)).toBe('unknown');
  });
});
