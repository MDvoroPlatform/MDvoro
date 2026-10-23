import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0055_qbank_session_builder.sql', import.meta.url), 'utf8');

describe('QBank builder migration contract', () => {
  it('is additive and safe to rerun', () => {
    expect(migration).toMatch(/add column if not exists aliases/i);
    expect(migration).toMatch(/create table if not exists public\.qbank_sources/i);
    expect(migration).toMatch(/on conflict\(exam_id,source_key\)/i);
    expect(migration).toMatch(/on conflict\(parent_id,slug\)/i);
    expect(migration).not.toMatch(/\b(drop table|delete from public\.questions|truncate)\b/i);
  });

  it('matches topic aliases while keeping the existing taxonomy id', () => {
    expect(migration).toMatch(/lower\(trim\(name\)\)=any\(v_seed_names\)/i);
    expect(migration).toMatch(/select id into v_topic/i);
    expect(migration).toMatch(/update public\.taxonomy_nodes set slug=.*where id=v_topic/is);
    expect(migration).toMatch(/colon & rectum.*rectum & colon/i);
    expect(migration).toMatch(/acid-base & electrolytes.*acid\/base & electrolytes/i);
  });

  it('keeps unmatched topics in a report and classifies Others live', () => {
    expect(migration).toMatch(/create table if not exists public\.qbank_taxonomy_seed_unmatched/i);
    expect(migration).toMatch(/insert into public\.qbank_taxonomy_seed_unmatched/i);
    expect(migration).toMatch(/when t\.name='Others' then count\(q\.id\) filter\(where not exists/i);
  });

  it('derives sources and reconstruction-year children from exam question data', () => {
    expect(migration).toMatch(/select distinct exam_id,reconstruction_year from public\.questions/i);
    expect(migration).toMatch(/create trigger exams_qbank_default_sources after insert on public\.exams/i);
    expect(migration).toMatch(/public\.qbank_builder_filter_tree/i);
  });
});
