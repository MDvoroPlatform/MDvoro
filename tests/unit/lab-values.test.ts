import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adminLabValueSchema } from '@/lib/validation/qbank';

const migration = readFileSync(new URL('../../supabase/migrations/0061_reviewed_lab_values.sql', import.meta.url), 'utf8');
const valid = { name: 'Analyte', category: 'hematology', referenceRange: '1–2', unit: 'g/L', siReferenceRange: '1–2', siUnit: 'g/L', population: 'Adult', sourceReference: 'https://example.org/reference', reviewNote: '', status: 'pending' };

describe('reviewed lab values', () => {
  it('requires citations and bounded reference data', () => {
    expect(adminLabValueSchema.safeParse(valid).success).toBe(true);
    expect(adminLabValueSchema.safeParse({ ...valid, sourceReference: 'short' }).success).toBe(false);
    expect(adminLabValueSchema.safeParse({ ...valid, status: 'published' }).success).toBe(false);
  });

  it('keeps student access restricted to approved values with reviewer traceability', () => {
    expect(migration).toMatch(/using\(status='approved'\)/i);
    expect(migration).toMatch(/has_permission\('content\.write'\)/i);
    expect(migration).toMatch(/reviewed_by uuid/i);
    expect(migration).toMatch(/source_required_for_approval/i);
    expect(migration).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate)\s+public\.questions\b/i);
  });
});
