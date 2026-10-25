import { describe, expect, it } from 'vitest';
import { adminQbankQuestionReportUpdateSchema, qbankQuestionRatingSchema, qbankQuestionReportSchema } from '@/lib/validation/qbank';
import { readFileSync } from 'node:fs';

const feedbackMigration = readFileSync(new URL('../../supabase/migrations/0060_qbank_ratings_and_issue_reports.sql', import.meta.url), 'utf8');

const questionId = '11111111-1111-4111-8111-111111111111';

describe('QBank learner feedback validation', () => {
  it('accepts a learner selected rating from one to five', () => {
    expect(qbankQuestionRatingSchema.safeParse({ questionId, rating: 5 }).success).toBe(true);
    expect(qbankQuestionRatingSchema.safeParse({ questionId, rating: 0 }).success).toBe(false);
    expect(qbankQuestionRatingSchema.safeParse({ questionId, rating: 6 }).success).toBe(false);
  });

  it('accepts supported report categories and defaults an empty message', () => {
    expect(qbankQuestionReportSchema.parse({ questionId, category: 'typo' }).message).toBe('');
    expect(qbankQuestionReportSchema.safeParse({ questionId, category: 'made_up' }).success).toBe(false);
    expect(qbankQuestionReportSchema.safeParse({ questionId, category: 'other', message: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('validates admin report status and bounds the resolution note', () => {
    expect(adminQbankQuestionReportUpdateSchema.safeParse({ reportId: questionId, status: 'resolved' }).success).toBe(true);
    expect(adminQbankQuestionReportUpdateSchema.safeParse({ reportId: questionId, status: 'deleted' }).success).toBe(false);
    expect(adminQbankQuestionReportUpdateSchema.safeParse({ reportId: questionId, status: 'resolved', note: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('adds private feedback tables without changing question content', () => {
    expect(feedbackMigration).toMatch(/create table if not exists public\.qbank_question_ratings/i);
    expect(feedbackMigration).toMatch(/create table if not exists public\.qbank_question_reports/i);
    expect(feedbackMigration).toMatch(/using\(user_id=auth\.uid\(\)\)/i);
    expect(feedbackMigration).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate)\s+public\.questions\b/i);
  });
});
