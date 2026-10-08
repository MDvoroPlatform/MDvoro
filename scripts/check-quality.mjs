import fs from 'node:fs';
const failures=[];
const read=(p)=>fs.readFileSync(p,'utf8');
const all=(dir)=>{const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.next','.git'].includes(e.name))continue;const p=`${dir}/${e.name}`;if(e.isDirectory())out.push(...all(p));else out.push(p);}return out;};
for(const file of all('app').concat(all('components')).concat(all('lib')).filter(p=>/\.(ts|tsx)$/.test(p))){const s=read(file);if(/\.parse\([^\n]*\)\.data/.test(s))failures.push(`${file}: parse().data pattern`);if(/className=\"[^\"]+\"\s+className=/.test(s))failures.push(`${file}: duplicate className`);}
const m4=read('supabase/migrations/0004_platform_architecture.sql');
if(!m4.includes("drop function if exists public.get_next_question(uuid,text,text);"))failures.push('0004: old get_next_question signature not dropped');
if(!m4.includes("drop function if exists public.admin_get_question(uuid);"))failures.push('0004: old admin_get_question signature not dropped');
if(!m4.includes("'flashcard_review'"))failures.push('0004: flashcard rate-limit action missing');
const m8=read('supabase/migrations/0008_hardening_and_quality.sql');
for(const required of ['set_question_taxonomy','create_flashcard','review_flashcard','student_alt_text','self_review_forbidden'])if(!m8.includes(required))failures.push(`0008: missing ${required}`);

const m14=read('supabase/migrations/0014_production_hardening.sql');
const m15=read('supabase/migrations/0015_production_integrity.sql');
for(const required of ['study_plans_user_unique','invalid_answer_option','content_generation_jobs_input_size_check']) { if(!m14.includes(required)) failures.push(`0014: missing ${required}`); }
for(const required of ['revoke create on schema public','auth.jwt()->>\'aal\'','revoke all on public.question_public from authenticated','guard_authenticated_write_rate','guard_write_trigger']) { if(!m15.includes(required)) failures.push(`0015: missing ${required}`); }
if(/result\.error\.flatten\(\)/.test(read('app/api/admin/import/route.ts'))) failures.push('admin import: validation internals must not be exposed');
if(!read('app/api/study-plan/route.ts').includes('assertMutationRequest')) failures.push('study plan: missing same-origin mutation protection');
if(!read('app/api/qbank/answer/route.ts').includes('invalid_answer_option')) failures.push('qbank answer: invalid option contract missing');

const m13=read('supabase/migrations/0013_question_bank_and_integrations.sql');
for(const required of ['question_bank_overview','correct_answer','workflow_status']) { if(!m13.includes(required)) failures.push(`0013: missing ${required}`); }
if(!fs.existsSync('docs/QUESTION-BANK.md')) failures.push('Question bank contract docs missing');
if(!fs.existsSync('app/admin/integrations/page.tsx')) failures.push('Integrations page missing');
for (const file of all('app/api').filter(p=>/route\.ts$/.test(p))) {
  const text = read(file);
  const hasMutation = /export async function (POST|PUT|PATCH|DELETE)/.test(text);
  if (hasMutation && /\.(json|formData)\(\)/.test(text) && !text.includes('readJson(') && !text.includes('readFormData') && !text.includes('content-length')) failures.push(`${file}: mutation must use bounded body parsing`);
  if (hasMutation && !text.includes('assertMutationRequest') && !text.includes('assertSameOrigin') && !file.includes('/auth/')) failures.push(`${file}: mutation missing same-origin protection`);
}
if(!read('app/api/flashcards/review/route.ts').includes("'flashcard_review'")) failures.push('flashcard review: rate limiting missing');
if(!read('app/api/study-plan/route.ts').includes('readJson')) failures.push('study plan: bounded JSON parser missing');
if(!read('app/api/account/exam/route.ts').includes('readJson')) failures.push('account exam: bounded JSON parser missing');
if(!read('app/api/admin/ai/route.ts').includes('220 * 1024')) failures.push('AI endpoint: request limit drifted from database contract');
const m11=read('supabase/migrations/0011_knowledge_graph.sql');
for(const required of ['learning_knowledge_graph','weakest_taxonomy_accuracy','Knowledge Graph']) { if(!m11.includes(required)) failures.push(`0011: missing ${required}`); }
if(!fs.existsSync('app/(app)/knowledge/page.tsx')) failures.push('Knowledge graph page missing');
for (const file of all('app').concat(all('components')).concat(all('lib')).filter(p=>/\.(ts|tsx)$/.test(p))) { const text = fs.readFileSync(file,'utf8'); if (/\bas any\b|:\s*any\b|<any>/.test(text)) failures.push(`${file}: explicit any is not allowed in application code`); }
if (read('app/layout.tsx').includes("mdvoro.example")) failures.push('root metadata: example production domain must not ship');
if (!fs.existsSync('tests/e2e/smoke.spec.ts')) failures.push('E2E smoke test missing');
if (!read('app/admin/layout.tsx').includes('requireStaff')) failures.push('admin layout: centralized staff authorization missing');
if (read('.nvmrc').trim() !== '22.23.3') failures.push('runtime: expected Node 22.23.3 LTS pin');
const pkg = JSON.parse(read('package.json')); if (pkg.dependencies?.['@supabase/supabase-js'] !== '2.117.3') failures.push('dependency: Supabase JS patch level drifted'); if (pkg.devDependencies?.['@playwright/test'] !== '1.63.0') failures.push('dependency: Playwright version drifted');

// Final security invariant: migrations added after the original hardening pass
// must not reintroduce a non-empty search_path on SECURITY DEFINER functions.
const migrations = all('supabase/migrations').filter(p => /\.sql$/.test(p));
for (const file of migrations) {
  const text = read(file);
  if (/security definer/i.test(text) && /set search_path\s*=\s*public/i.test(text) && /0019_final_security_and_integrity\.sql$/.test(file) === false && /0018_rules_based_learning_engine\.sql$/.test(file)) {
    failures.push(`${file}: SECURITY DEFINER migration must pin an empty search_path`);
  }
}

// CSS contract: every referenced custom property must be defined.
const cssFiles = all('.').filter(p => /\.css$/.test(p) && !p.includes('node_modules') && !p.includes('.next'));
const cssText = cssFiles.map(read).join('\n');
const definedVars = new Set([...cssText.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
for (const name of [...new Set([...cssText.matchAll(/var\(--([\w-]+)/g)].map(m => m[1]))]) {
  if (!definedVars.has(name)) failures.push(`css: undefined custom property --${name}`);
}

if (!read('supabase/migrations/0019_final_security_and_integrity.sql').includes("alter function public.smart_student_snapshot() set search_path = '';")) failures.push('0019: smart snapshot search_path closure missing');
if (!read('supabase/migrations/0019_final_security_and_integrity.sql').includes("and q.is_published = true")) failures.push('0019: question learning context accessibility gate missing');

if(failures.length){
  console.error('Quality contract check failed\\n'+failures.join('\\n'));
  process.exit(1);
}
console.log('Quality contract check passed.');
