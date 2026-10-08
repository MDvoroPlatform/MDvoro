import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const forbiddenClient=[/SUPABASE_SERVICE_ROLE_KEY/i,/service_role/i,/answer_key\s*[:=]/i,/isAdmin\s*=\s*true/i,/createServerClient/i,/from ['"]@\/lib\/server\//i,/from ['"]next\/headers['"]/i];
const violations=[];
function isClient(text){return /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(text);}
function walk(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.next','.git'].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(ts|tsx|js|mjs)$/.test(entry.name)){const rel=path.relative(root,full).replaceAll(path.sep,'/');const text=fs.readFileSync(full,'utf8');if(!isClient(text))continue;for(const rx of forbiddenClient)if(rx.test(text))violations.push(`${rel}: ${rx}`);}}}
walk(path.join(root,'app'));walk(path.join(root,'components'));walk(path.join(root,'lib'));
if(violations.length){console.error('Client architecture check failed\n'+violations.join('\n'));process.exit(1);}console.log('Client architecture check passed.');
