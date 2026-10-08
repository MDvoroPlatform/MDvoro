import { describe, expect, it } from 'vitest';
import { features } from '@/lib/config/features';

describe('feature configuration', () => {
  it('keeps AI disabled unless explicitly enabled', () => {
    expect(features.ai).toBe(false);
  });
});
