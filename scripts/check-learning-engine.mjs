import fs from 'node:fs';
const required = [
  'supabase/migrations/0018_rules_based_learning_engine.sql',
  'lib/learning/rules.ts',
  'app/api/smart-mentor/route.ts',
  'components/dashboard/smart-mentor.tsx'
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
const sql=fs.readFileSync(required[0],'utf8');
for (const token of ['smart_student_snapshot','ai_enabled','security definer','revoke all on function','grant execute on function']) if (!sql.toLowerCase().includes(token.toLowerCase())) throw new Error(`missing-contract:${token}`);
for (const file of required.slice(1)) if (/openai|anthropic|gemini|generateText|chat\.completions|responses\.create/i.test(fs.readFileSync(file,'utf8'))) throw new Error(`AI dependency in rules engine:${file}`);
console.log('Learning engine check: PASS');
