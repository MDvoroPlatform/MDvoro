import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const walk = (dir) => fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name); return e.isDirectory()?walk(p):[p.replaceAll(path.sep,'/')];
});
const api = read('lib/server/api.ts');
const migration = read('supabase/migrations/0043_final_security_scalability_hardening.sql');
const declared = [...api.matchAll(/action:\s*'([^']+)'(?:\s*\|\s*'([^']+)')+/g)][0];
if(!declared) throw new Error('Could not parse rate-limit action union');
const union = [...api.matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]).filter(a=>['qbank_answer','qbank_next','qbank_catalog','qbank_break','flashcard_review','flashcard_delete','admin_write','admin_upload','auth_mutation'].includes(a));
const declaredSet = new Set(union);
const dbActions = [...migration.matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]).filter(a=>declaredSet.has(a));
const dbSet = new Set(dbActions);
for(const a of declaredSet){ if(!dbSet.has(a)) throw new Error(`Rate-limit action missing in DB allow-list: ${a}`); }

const routes = walk('app/api').filter(p=>p.endsWith('/route.ts'));
const mutating = [];
for(const f of routes){
  const src=read(f);
  const methods=['POST','PUT','PATCH','DELETE'];
  if(methods.some(m=>new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(src))) mutating.push([f,src]);
}
const missingCsrf = mutating.filter(([f,s])=>!(s.includes('assertMutationRequest(')||s.includes('assertSameOrigin(')));
if(missingCsrf.length) throw new Error(`Mutation route(s) without same-origin guard: ${missingCsrf.map(x=>x[0]).join(', ')}`);

const dangerous=[];
for(const f of walk('app').filter(p=>/\.(ts|tsx)$/.test(p))){
  const src=read(f);
  if(/dangerouslySetInnerHTML\s*=|\beval\s*\(|\bnew Function\s*\(/.test(src)) dangerous.push(f);
}
if(dangerous.length) throw new Error(`Dangerous HTML/eval pattern found: ${dangerous.join(', ')}`);

console.log(`Runtime contracts: PASS (${routes.length} API routes, ${mutating.length} mutating routes, ${declaredSet.size} rate-limit actions)`);
