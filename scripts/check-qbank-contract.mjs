import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const catalog = ['0029_qbank_catalog_results_hardening.sql','0031_phase26_exam_engine_legal_ops.sql','0032_qbank_admin_ops_hardening.sql','0033_qbank_timing_precision.sql'].map((file) => read(`supabase/migrations/${file}`)).join('\n');
const keyTerms = read('supabase/migrations/0034_key_terms_precision.sql');
const player = read('components/qbank/qbank-session-player.tsx');
const result = read('app/(app)/qbank/session/[sessionId]/result/page.tsx');
const startApi = read('app/api/qbank/session/start/route.ts');
const legacyNext = read('app/api/qbank/next/route.ts');
const legacyAnswer = read('app/api/qbank/answer/route.ts');
const messages = read('lib/i18n/messages.ts');

must(/topics_by_subject/.test(catalog), 'catalog must expose topics_by_subject');
must(/product_max_items/.test(catalog) && /official_max_items/.test(catalog), 'exam catalog must separate product and official limits');
must(/p_question_count > 300/.test(catalog), 'session engine must enforce the 300-question product ceiling');
must(/student_key_terms/.test(keyTerms) && /regexp_replace/.test(keyTerms), 'key terms must be deterministic and compact');
must(!/qbank_catalog[\s\S]{0,600}data\?\.\[0\]/.test(read('app/api/qbank/catalog/route.ts')), 'qbank catalog jsonb RPC must not be treated as an array');
must(!/get_study_session_state[\s\S]{0,900}data\?\.\[0\]/.test(read('app/api/qbank/session/[sessionId]/state/route.ts')), 'session state jsonb RPC must not be treated as an array');
must(!/study_session_result[\s\S]{0,250}data\?\.\[0\]/.test(result), 'study session result jsonb RPC must not be treated as an array');
must(/get_study_session_state\(p_session_id uuid,p_position integer default 0\)/.test(catalog), 'session state must support server resume');
must(/session_not_complete/.test(catalog), 'results must reject incomplete sessions');
must(/set_study_session_item_state/.test(catalog) && /block_closed/.test(catalog) && /on_break/.test(catalog), 'item state must honor block locks and breaks');
for (const pool of ['mixed','unseen','unanswered','incorrect','answered','bookmarked']) must(new RegExp(`'${pool}'`).test(catalog), `pool ${pool} missing from session engine`);
must(/load\(0\)/.test(player), 'player must request server resume position 0');
must(/slice\(0,\s*3\)/.test(player), 'player must expose at most three key terms');
must(/legacy_qbank_disabled/.test(legacyNext) && /legacy_qbank_disabled/.test(legacyAnswer), 'legacy qbank routes must be explicitly disabled');
must(/exam_id:\s*string;/.test(result) && /exam_code:\s*string;/.test(result), 'result contract must have clean exam_id/exam_code fields');
for (const field of ['duration_seconds','marked_count','note_count']) must(new RegExp(field).test(result), `result contract missing ${field}`);
must(/examId/.test(startApi), 'start API must accept exam id');
for (const key of ['poolUnanswered','blockTime','breakAvailable','takeBreak','onBreak','breakRemaining','resumeExam','breakUnavailable','couldNotResume','unmark','yourAnswer','practiceUnanswered','explanation']) {
  const count = (messages.match(new RegExp(key + ':', 'g')) || []).length;
  must(count >= 4, `translation key ${key} is missing from one or more locales`);
}
console.log('QBank contract gate: PASS');
