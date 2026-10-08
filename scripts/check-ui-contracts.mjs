import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const walk=(dir)=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
 if(e.isDirectory()&&['node_modules','.next','.git','coverage','test-results','playwright-report'].includes(e.name))return [];
 const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p.replaceAll(path.sep,'/')];
});
const tsx=walk('.').filter(f=>/\.(tsx|ts)$/.test(f)&&!f.includes('node_modules')&&!f.startsWith('.next/'));
const all=tsx.map(read).join('\n');
const buttonIssues=[];
for(const f of tsx){
 const s=read(f);
 for(const m of s.matchAll(/<button\b([^>]*)>/gs)){
  const a=m[1];
  if(!/\bonClick\s*=|\btype\s*=\s*["'](?:submit|button|reset)["']/.test(a)) buttonIssues.push(f);
 }
}
if(buttonIssues.length) throw new Error(`Ambiguous <button> elements require explicit type or onClick: ${[...new Set(buttonIssues)].join(', ')}`);

const pageRoutes=new Set(['/']);
for(const f of walk('app').filter(f=>f.endsWith('/page.tsx'))){
 let rel=f.slice(4,-8).replace(/\\/g,'/');
 const parts=rel.split('/').filter(x=>!(x.startsWith('(')&&x.endsWith(')'))).map(x=>x.startsWith('[')?':dynamic':x);
 pageRoutes.add('/'+parts.join('/').replace(/\/+/g,'/').replace(/\/$/,''));
}
const hrefs=[...all.matchAll(/href\s*=\s*["'](\/[^"']*)["']/g)].map(m=>m[1].split('?')[0].split('#')[0]).filter(Boolean);
const missing=[...new Set(hrefs)].filter(h=>{
 if(pageRoutes.has(h)) return false;
 const parts=h.split('/').filter(Boolean);
 return ![...pageRoutes].some(r=>{const rp=r.split('/').filter(Boolean); if(rp.length!==parts.length)return false; return rp.every((x,i)=>x===':dynamic'||x===parts[i]);});
});
if(missing.length) throw new Error(`Literal internal href(s) do not resolve to an app route: ${missing.join(', ')}`);

const apiRoutes=new Set(walk('app/api').filter(f=>f.endsWith('/route.ts')).map(f=>{
 let r='/api/'+f.slice('app/api/'.length,-'route.ts'.length).replace(/\\/g,'/');
 return r.replace(/\/$/,'');
}));
const apiRefs=[...all.matchAll(/[`"'](\/api\/[A-Za-z0-9_\-\/\[\]]+)/g)].map(m=>m[1]).filter(Boolean);
const apiMissing=[...new Set(apiRefs)].filter(h=>!apiRoutes.has(h)&&![...apiRoutes].some(r=>r.includes('[')&&h.split('/').length===r.split('/').length));
if(apiMissing.length) throw new Error(`API references do not map to route handlers: ${apiMissing.join(', ')}`);
console.log(`UI contracts: PASS (${tsx.length} TS/TSX files, no ambiguous buttons, ${hrefs.length} literal internal hrefs)`);
