import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0067_admin_atomic_publishing_qbank_performance.sql', import.meta.url), 'utf8');
const saveRoute = readFileSync(new URL('../../app/api/admin/questions/save/route.ts', import.meta.url), 'utf8');
const form = readFileSync(new URL('../../components/admin/question-form.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../../components/admin/question-version-history.tsx', import.meta.url), 'utf8');

describe('Admin question save and publishing contract', () => {
  it('saves question content and related metadata in one database transaction', () => {
    expect(migration).toMatch(/function public\.admin_save_question\(/i);
    expect(migration).toMatch(/perform public\.set_question_taxonomy/i);
    expect(migration).toMatch(/perform public\.set_question_key_terms/i);
    expect(migration).toMatch(/perform public\.admin_set_question_reconstruction/i);
    expect(migration).toMatch(/perform public\.admin_upsert_question_rights/i);
    expect(saveRoute).toMatch(/rpc\('admin_save_question'/);
    expect(form).toMatch(/fetch\('\/api\/admin\/questions\/save'/);
  });

  it('preserves publication on edit and gives unpublishing a dedicated audited action', () => {
    expect(migration).toMatch(/is_published=v_is_published,workflow_status=case when v_is_published then v_status else 'draft' end/i);
    expect(migration).toMatch(/function public\.admin_unpublish_question\(/i);
    expect(migration).toMatch(/'admin_unpublished'/i);
    expect(form).toMatch(/\/api\/admin\/questions\/unpublish/);
  });

  it('preserves rights metadata the editor does not expose and only keeps verification for unchanged sources', () => {
    expect(migration).toMatch(/v_existing_rights public\.question_rights%rowtype/i);
    expect(migration).toMatch(/v_existing_rights\.source_name[\s\S]*v_existing_rights\.source_year[\s\S]*v_existing_rights\.attribution[\s\S]*v_existing_rights\.notes/i);
    expect(migration).toMatch(/v_existing_rights\.rights_basis=p_rights_basis[\s\S]*v_existing_rights\.source_reference/i);
    expect(migration).toMatch(/set verified=true,verified_at=v_existing_rights\.verified_at,verified_by=v_existing_rights\.verified_by/i);
  });

  it('keeps a private mapping for reversible legacy admin normalization', () => {
    expect(migration).toMatch(/admin_role_migration_0067_backup/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/legacy_role_disabled/i);
  });

  it('snapshots authoring metadata and restores prior versions as a new audited version', () => {
    expect(migration).toMatch(/authoring_metadata jsonb/i);
    expect(migration).toMatch(/function public\.admin_list_question_versions\(/i);
    expect(migration).toMatch(/function public\.admin_restore_question_version\(/i);
    expect(migration).toMatch(/'question_version_restored'/i);
    expect(migration).toMatch(/publication_preserved/i);
    expect(history).toMatch(/\/restore/);
    expect(history).toMatch(/current state will remain in version history/i);
  });
});
