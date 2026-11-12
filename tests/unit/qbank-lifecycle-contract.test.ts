import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sessionPage = readFileSync(new URL('../../app/(app)/qbank/session/[sessionId]/page.tsx', import.meta.url), 'utf8');
const stateRoute = readFileSync(new URL('../../app/api/qbank/session/[sessionId]/state/route.ts', import.meta.url), 'utf8');
const player = readFileSync(new URL('../../components/qbank/qbank-session-player.tsx', import.meta.url), 'utf8');
const configurator = readFileSync(new URL('../../components/qbank/qbank-configurator.tsx', import.meta.url), 'utf8');

describe('QBank lifecycle performance and safety contracts', () => {
  it('loads the full session once, then uses compact owned question snapshots', () => {
    expect(sessionPage).not.toMatch(/rpc\(['"]get_study_session_state/);
    expect(stateRoute).toMatch(/get_study_session_state_compact/);
    expect(stateRoute).toMatch(/Cache-Control': 'private,no-store'/);
    expect(player).toMatch(/compact=1/);
    expect(player).toMatch(/items: next\.items \?\? previous\?\.items/);
  });

  it('uses bounded prefetch, aborts superseded navigation, and applies answers locally', () => {
    expect(player).toMatch(/prefetch=1/);
    expect(player).toMatch(/navigationController\.current\?\.abort\(\)/);
    expect(player).toMatch(/setState\(updated\)/);
    expect(player).toMatch(/body\.already_answered/);
  });

  it('does not reload exam catalog data on QBank filter changes', () => {
    expect(configurator).toMatch(/fetch\(`\/api\/qbank\/catalog\?examId=/);
    expect(configurator).toMatch(/\}, \[examId, loadedExam\]\);/);
    expect(configurator).toMatch(/\}, \[examId, loadedExam, treePayload\]\);/);
  });
});
