import { describe, expect, it, vi } from 'vitest';
import { LatestNavigationRequest, SessionNavigationCache, sessionNavigationCacheTtl } from '@/lib/qbank/session-navigation';

describe('QBank session navigation cache', () => {
  it('coalesces concurrent reads and reuses a warm entry until expiry', async () => {
    const cache = new SessionNavigationCache<string>();
    const loader = vi.fn(async () => 'question');
    await expect(cache.getOrLoad(2, loader, 100, 10)).resolves.toBe('question');
    await expect(cache.getOrLoad(2, loader, 100, 50)).resolves.toBe('question');
    expect(loader).toHaveBeenCalledTimes(1);
    await expect(cache.getOrLoad(2, loader, 100, 111)).resolves.toBe('question');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clears a failed read so navigation can retry', async () => {
    const cache = new SessionNavigationCache<string>();
    await expect(cache.getOrLoad(1, async () => { throw new Error('network'); }, 100, 0)).rejects.toThrow('network');
    await expect(cache.getOrLoad(1, async () => 'retry', 100, 1)).resolves.toBe('retry');
  });

  it('ignores stale navigation responses after a newer request begins', () => {
    const latest = new LatestNavigationRequest();
    const old = latest.begin();
    const current = latest.begin();
    expect(latest.isCurrent(old)).toBe(false);
    expect(latest.isCurrent(current)).toBe(true);
  });

  it('expires exam snapshots before the next block boundary and disables them on breaks', () => {
    const start = Date.UTC(2026, 0, 1);
    const session = {
      on_break: false, status: 'in_progress', mode: 'exam', block_duration_minutes: 30,
      started_at: new Date(start).toISOString(), break_seconds_used: 0, practice_paused_seconds: 0, break_started_at: null,
    };
    expect(sessionNavigationCacheTtl(session, start + 29 * 60_000)).toBe(59_500);
    expect(sessionNavigationCacheTtl({ ...session, on_break: true }, start + 60_000)).toBe(0);
    expect(sessionNavigationCacheTtl({ ...session, mode: 'practice' }, start + 60_000)).toBe(15_000);
  });
});
