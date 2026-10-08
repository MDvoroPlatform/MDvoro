import { describe, expect, it } from 'vitest';
import { learnerStateLabel } from '@/lib/learning/rules';

describe('rules-based learner model', () => {
  it('keeps learner states deterministic and non-AI', () => {
    expect(learnerStateLabel('new')).toContain('New');
    expect(learnerStateLabel('recovery')).toContain('Recovery');
    expect(learnerStateLabel('building')).toContain('Building');
    expect(learnerStateLabel('strong')).toContain('Strong');
    expect(learnerStateLabel('advanced')).toContain('Advanced');
  });
});
