import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir='supabase/migrations';
const files=readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
const combined=files.map(n=>readFileSync(join(dir,n),'utf8')).join('\n');
const tables=[...combined.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z0-9_]+)/gi)].map(m=>m[1]);
const unique=[...new Set(tables)];
const rls=new Set([...combined.matchAll(/alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)].map(m=>m[1]));
const missing=unique.filter(t=>!rls.has(t));
if(missing.length){console.error('RLS source gate failed');for(const t of missing)console.error(`- public.${t} has no source-level RLS enable marker`);process.exit(1);}
console.log(`RLS source gate: PASS (${unique.length} public tables checked; ${rls.size} RLS-enabled markers)`);
