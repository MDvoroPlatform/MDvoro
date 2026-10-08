import { describe, expect, it } from 'vitest';
import { assertSameOrigin } from '@/lib/security/origin';

describe('same-origin mutation guard', () => {
  it('accepts an exact Origin match', () => {
    const request = new Request('https://mdvoro.com/api/test', {
      headers: { origin: 'https://mdvoro.com' },
    });
    expect(assertSameOrigin(request)).toBe(true);
  });

  it('rejects a cross-origin mutation attempt', () => {
    const request = new Request('https://mdvoro.com/api/test', {
      headers: { origin: 'https://attacker.example' },
    });
    expect(assertSameOrigin(request)).toBe(false);
  });

  it('rejects a browser mutation without Origin or Referer', () => {
    const request = new Request('https://mdvoro.com/api/test');
    expect(assertSameOrigin(request)).toBe(false);
  });
});
