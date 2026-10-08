import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const suspicious = [
  /made\s+with\s+(?:lovable|bolt|v0|replit)/i,
  /built\s+with\s+(?:lovable|bolt|v0|replit)/i,
  /generated\s+by\s+(?:lovable|bolt|v0|replit|claude)/i,
  /@ts-ignore|@ts-nocheck/,
];

function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (['node_modules','.next','.git'].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(ts|tsx|js|mjs|css|html)$/.test(entry.name)) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      for (const rx of suspicious) if (rx.test(text)) failures.push(`${rel}: hygiene marker ${rx}`);
    }
  }
}

for (const dir of ['app','components','lib']) if (fs.existsSync(path.join(root, dir))) walk(dir);
if (failures.length) {
  console.error('Source hygiene check failed\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Source hygiene check passed.');
