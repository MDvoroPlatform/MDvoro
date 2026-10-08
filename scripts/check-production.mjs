import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

for (const required of [
  'app/layout.tsx',
  'app/error.tsx',
  'app/admin/layout.tsx',
  'proxy.ts',
  'lib/server/authorization.ts',
  'lib/server/api.ts',
  'lib/supabase/server.ts',
  'supabase/migrations/0014_production_hardening.sql',
  'supabase/migrations/0015_production_integrity.sql',
  'supabase/migrations/0016_security_function_closure.sql',
  'tests/e2e/smoke.spec.ts',
  '.nvmrc',
]) if (!exists(required)) failures.push(`missing required production file: ${required}`);

if (exists('app/layout.tsx') && read('app/layout.tsx').includes('mdvoro.example')) {
  failures.push('production metadata still contains mdvoro.example');
}

const packageJson = JSON.parse(read('package.json'));
for (const script of ['build', 'lint', 'typecheck', 'test', 'test:e2e', 'check:architecture', 'check:quality']) {
  if (!packageJson.scripts?.[script]) failures.push(`package script missing: ${script}`);
}

if (!exists('package-lock.json')) {
  failures.push('package-lock.json is missing: production installs are not reproducible.');
}
if (exists('next.config.ts') && read('next.config.ts').includes("unsafe-inline")) {
  failures.push('next.config.ts contains unsafe-inline; CSP must use request nonces.');
}
if (exists('lib/security/origin.ts') && /trustedOrigin \\?\\? requestOrigin/.test(read('lib/security/origin.ts'))) {
  failures.push('Origin validation may fall back to an attacker-controlled request origin.');
}
if (!exists('components/auth/turnstile.tsx')) failures.push('Signup bot protection component missing.');
if (!read('.env.example').includes('MDVORO_APP_ORIGIN=')) failures.push('MDVORO_APP_ORIGIN missing from .env.example.');

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(rel);
  }
}
for (const dir of ['app', 'components', 'lib']) if (exists(dir)) walk(dir);

for (const file of sourceFiles) {
  const text = read(file);
  if (/\bas any\b|:\s*any\b|<any>/.test(text)) failures.push(`${file}: explicit any`);
  if (/dangerouslySetInnerHTML|\binnerHTML\b|\beval\(/.test(text)) failures.push(`${file}: dangerous dynamic HTML/eval`);
  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(text)) failures.push(`${file}: service-role secret referenced in application code`);
}

if (failures.length) {
  console.error('Production readiness check failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Production readiness static check passed.');
