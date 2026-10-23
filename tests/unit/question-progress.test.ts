import { describe, expect, it } from 'vitest';
import { calculateQuestionProgress } from '@/lib/dashboard/question-progress';

describe('calculateQuestionProgress', () => {
  it('sums eligible counts across the selected exam subjects', () => {
    expect(calculateQuestionProgress([
      { available: 120, attempted: 30 },
      { available: 80, attempted: 20 },
    ])).toEqual({ total: 200, answered: 50, percentage: 25 });
  });

  it('clamps answered questions to the available pool and percentage to 100', () => {
    expect(calculateQuestionProgress([{ available: 10, attempted: 14 }])).toEqual({
      total: 10,
      answered: 10,
      percentage: 100,
    });
  });

  it('shows zero answered out of the real available total for a new learner', () => {
    expect(calculateQuestionProgress([{ available: 5497, attempted: 0 }])).toEqual({
      total: 5497,
      answered: 0,
      percentage: 0,
    });
  });

  it('handles string counts and an empty pool without dividing by zero', () => {
    expect(calculateQuestionProgress([{ available: '0', attempted: '3' }])).toEqual({
      total: 0,
      answered: 0,
      percentage: 0,
    });
  });
});
