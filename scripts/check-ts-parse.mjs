import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join as pathJoin } from 'node:path';
import { join, relative } from 'node:path';
const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  ts = require(pathJoin(globalRoot, 'typescript'));
}

const root = process.cwd();
const sourceRoots = ['app', 'components', 'lib', 'scripts'];
const failures = [];
let count = 0;
function walk(dir) {
  for (const name of readdirSync(join(root, dir))) {
    const file = join(root, dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) { walk(relative(root, file)); continue; }
    if (!/\.(ts|tsx)$/.test(name) || /\.d\.ts$/.test(name)) continue;
    count += 1;
    const source = readFileSync(file, 'utf8');
    const scriptKind = name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
    for (const diagnostic of sf.parseDiagnostics) failures.push(`${relative(root, file)}: syntax diagnostic ${diagnostic.code}`);
  }
}
for (const sourceRoot of sourceRoots) walk(sourceRoot);
if (failures.length) {
  console.error('TypeScript syntax gate failed');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`TypeScript syntax gate: PASS (${count} TS/TSX files)`);
