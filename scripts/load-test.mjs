/*
 * Lightweight Node 22+ concurrency probe for a deployed MDvoro instance.
 * Default target is the public liveness endpoint, which isolates web-tier capacity.
 * Authenticated QBank/DB testing must be run against staging with real test accounts.
 */
const base = (process.env.LOAD_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const endpoint = process.env.LOAD_PATH || '/api/health/live';
const concurrency = Math.max(1, Math.min(Number(process.env.LOAD_CONCURRENCY || 500), 10000));
const rounds = Math.max(1, Math.min(Number(process.env.LOAD_ROUNDS || 1), 20));
const timeoutMs = Math.max(1000, Math.min(Number(process.env.LOAD_TIMEOUT_MS || 10000), 60000));

const timings = [];
let ok = 0;
let failed = 0;
const target = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

async function one() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(target, { cache: 'no-store', signal: controller.signal });
    const elapsed = performance.now() - started;
    timings.push(elapsed);
    if (res.ok) ok += 1;
    else failed += 1;
  } catch {
    timings.push(performance.now() - started);
    failed += 1;
  } finally {
    clearTimeout(timer);
  }
}

for (let round = 0; round < rounds; round += 1) {
  await Promise.all(Array.from({ length: concurrency }, one));
}

timings.sort((a, b) => a - b);
const percentile = (p) => timings[Math.min(timings.length - 1, Math.floor((timings.length - 1) * p))] ?? 0;
const total = ok + failed;
const errorRate = total ? (failed / total) * 100 : 100;
console.log(JSON.stringify({ target, concurrency, rounds, requests: total, ok, failed, error_rate_percent: Number(errorRate.toFixed(2)), p50_ms: Number(percentile(0.5).toFixed(1)), p95_ms: Number(percentile(0.95).toFixed(1)), p99_ms: Number(percentile(0.99).toFixed(1)), max_ms: Number((timings.at(-1) ?? 0).toFixed(1)) }, null, 2));
process.exitCode = failed ? 1 : 0;
