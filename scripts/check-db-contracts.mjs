import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const testDir = path.join(root, 'supabase', 'tests');
const migrations = fs.readdirSync(migrationDir).filter((n) => n.endsWith('.sql')).sort();
const combined = migrations.map((n) => fs.readFileSync(path.join(migrationDir, n), 'utf8')).join('\n');

const tables = [...combined.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z0-9_]+)/gi)].map((m) => m[1]);
const uniqueTables = [...new Set(tables)];
const rls = new Set([...combined.matchAll(/alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1]));
const missingRls = uniqueTables.filter((t) => !rls.has(t));
const policies = [...combined.matchAll(/create\s+policy\b/gi)].length;

const failures = [];
if (missingRls.length) failures.push(`Tables without source-level RLS: ${missingRls.join(', ')}`);
if (!fs.existsSync(path.join(testDir, 'rls_core.sql'))) failures.push('Missing supabase/tests/rls_core.sql');
if (!fs.existsSync(path.join(testDir, 'security_contracts.sql'))) failures.push('Missing supabase/tests/security_contracts.sql');
if (!fs.existsSync(path.join(testDir, 'production_db_contracts.sql'))) failures.push('Missing production DB contract test suite.');

if (failures.length) {
    console.error('Database contract gate FAILED');
    failures.forEach((f) => console.error(`- ${f}`));
    process.exit(1);
}

console.log(`Database source gate: PASS (${uniqueTables.length} public tables, ${policies} policies, all tables marked RLS-enabled).`);
console.log('Runtime DB tests: execute supabase/tests/*.sql against a disposable/production-like Supabase database before launch.');
