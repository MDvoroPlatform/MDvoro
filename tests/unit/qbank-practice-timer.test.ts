import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0063_practice_timer_pause_resume.sql', import.meta.url), 'utf8');

describe('practice timer pause and resume contract', () => {
  it('persists pauses separately and excludes paused time from elapsed practice time', () => {
    expect(migration).toMatch(/practice_paused_seconds integer not null default 0/i);
    expect(migration).toMatch(/practice_pause_started_at timestamptz/i);
    expect(migration).toMatch(/pause_practice_session\(p_session_id uuid\)/i);
    expect(migration).toMatch(/resume_practice_session\(p_session_id uuid\)/i);
    expect(migration).toMatch(/v_session\.practice_paused_seconds/i);
  });

  it('keeps answer and session-state writes locked while a practice session is paused', () => {
    expect(migration).toMatch(/break_started_at=now\(\)/i);
    expect(migration).toMatch(/break_started_at=null/i);
    expect(migration).toMatch(/get_study_session_state\(p_session_id uuid,p_position integer default 0\)/i);
  });
});
