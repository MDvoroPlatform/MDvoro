import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0064_personal_qbank_library.sql', import.meta.url), 'utf8');

describe('personal QBank library contract', () => {
  it('returns only learner-owned bookmarks and incorrect-answer history', () => {
    expect(migration).toMatch(/b\.user_id=auth\.uid\(\)/i);
    expect(migration).toMatch(/s\.user_id=auth\.uid\(\)/i);
    expect(migration).toMatch(/coalesce\(s\.attempts,0\)>coalesce\(s\.correct,0\)/i);
    expect(migration).toMatch(/q\.is_published and q\.workflow_status='published'/i);
    expect(migration).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate)\s+public\.questions\b/i);
  });
});
