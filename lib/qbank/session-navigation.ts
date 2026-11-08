type CacheEntry<T> = { expiresAt: number; value: Promise<T> };

export function sessionNavigationCacheTtl(session: {
  on_break: boolean;
  status: string;
  mode: string;
  block_duration_minutes: number;
  started_at: string;
  break_seconds_used: number;
  practice_paused_seconds: number;
  break_started_at: string | null;
}, now = Date.now()): number {
  if (session.on_break || session.status !== 'in_progress') return 0;
  if (session.mode !== 'exam') return 15_000;
  const blockSeconds = session.block_duration_minutes * 60;
  if (blockSeconds <= 0) return 15_000;
  const wallElapsed = Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 1000));
  const pausedNow = session.break_started_at
    ? Math.max(0, Math.floor((now - new Date(session.break_started_at).getTime()) / 1000)) : 0;
  const activeElapsed = Math.max(0, wallElapsed - session.break_seconds_used - session.practice_paused_seconds - pausedNow);
  const secondsToBlockEnd = blockSeconds - (activeElapsed % blockSeconds);
  return Math.max(0, secondsToBlockEnd * 1000 - 500);
}

/** Per-player, per-session cache for immutable question snapshots. */
export class SessionNavigationCache<T> {
  private readonly entries = new Map<number, CacheEntry<T>>();

  getOrLoad(position: number, loader: () => Promise<T>, ttlMs: number, now = Date.now()): Promise<T> {
    const cached = this.entries.get(position);
    if (cached && cached.expiresAt > now) return cached.value;

    const entry: CacheEntry<T> = { expiresAt: now + ttlMs, value: Promise.resolve().then(loader) };
    this.entries.set(position, entry);
    entry.value = entry.value.catch((error: unknown) => {
      if (this.entries.get(position) === entry) this.entries.delete(position);
      throw error;
    });
    return entry.value;
  }

  delete(position: number): void {
    this.entries.delete(position);
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Ignores stale responses when a later navigation request has already started. */
export class LatestNavigationRequest {
  private sequence = 0;

  begin(): number {
    this.sequence += 1;
    return this.sequence;
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.sequence;
  }
}
