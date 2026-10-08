import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd();
const failures=[];
function walk(dir){for(const name of readdirSync(join(root,dir))){const p=join(root,dir,name);const st=statSync(p);if(st.isDirectory())walk(join(dir,name));else if(name==='route.ts')inspect(p);}}
function inspect(path){const text=readFileSync(path,'utf8');const rel=path.slice(root.length+1);if(/export async function (POST|PUT|PATCH|DELETE)\b/.test(text) && !/assertMutationRequest|assertSameOrigin/.test(text))failures.push(`${rel}: mutation route lacks same-origin protection`);if(/auth\.getUser\(\)/.test(text) && /export async function GET/.test(text) && /NextResponse\.json\((data|plan|payload|body|results|question)/.test(text) && !/noStoreJson|private, no-store|no-store/.test(text))failures.push(`${rel}: private GET should set no-store`);}
if(existsSync(join(root,'app','api')))walk('app/api');
if(failures.length){console.error('HTTP contract gate failed');for(const f of failures)console.error('- '+f);process.exit(1);}console.log('HTTP contract gate: PASS');
