import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const sqlFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const failures = [];
let dollarBlocks = 0;
for (const name of sqlFiles) {
  const text = readFileSync(join(migrationsDir, name), 'utf8');
  const dollars = (text.match(/\$\$/g) ?? []).length;
  dollarBlocks += dollars / 2;
  if (dollars % 2 !== 0) failures.push(`${name}: unbalanced $$ delimiters`);
  if (/^Python$|^PY$|Path\(p\)\.write_text|static guard requires/m.test(text)) failures.push(`${name}: scripting residue detected`);
}
const combined = sqlFiles.map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');
for (const functionName of new Set([...combined.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)[\s\S]*?security\s+definer/gi)].map((m) => m[1]))) {
  const securedInline = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${functionName}\\b[\\s\\S]*?security\\s+definer[\\s\\S]*?set\\s+search_path\\s*=\\s*''`, 'i').test(combined);
  const securedLater = new RegExp(`alter\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?set\\s+search_path\\s*=\\s*''`, 'i').test(combined);
  if (!securedInline && !securedLater) failures.push(`${functionName}: no migration-level empty search_path hardening marker found`);
}
if (failures.length) {
  console.error('SQL structure gate failed');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`SQL structure gate: PASS (${sqlFiles.length} migrations, ${dollarBlocks} dollar-quoted blocks, security-definer hardening markers present)`);
