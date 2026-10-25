import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0062_notebook_private_annotations.sql', import.meta.url), 'utf8');

describe('private annotation notebook contract', () => {
  it('returns only the authenticated learner annotations and caps the projection', () => {
    expect(migration).toMatch(/where a\.user_id=auth\.uid\(\)/i);
    expect(migration).toMatch(/least\(coalesce\(p_limit,200\),500\)/i);
    expect(migration).toMatch(/revoke all on function public\.list_my_qbank_annotations\(integer\) from public,anon/i);
    expect(migration).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate)\s+public\.questions\b/i);
  });
});
