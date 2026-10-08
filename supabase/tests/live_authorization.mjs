// Live, disposable authorization + concurrency checks through the Supabase
// Management API. Requires SUPABASE_ACCESS_TOKEN in the process environment.
import { randomUUID } from 'node:crypto';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = 'yqadaomiudllzujngbba';
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');

const ids = Object.fromEntries(['studentA','studentB','admin','exam','question','attemptRetry','cardA','cardB','planA','planB'].map(k => [k, randomUUID()]));
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function sql(query, { allowFailure = false } = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: false }),
  });
  const body = await response.json();
  if (!response.ok && !allowFailure) throw new Error(`SQL failed (${response.status}): ${JSON.stringify(body)}`);
  return { ok: response.ok, body };
}

function asUser(userId, query, aal = 'aal1') {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated', aal });
  return `begin; set local role authenticated; select set_config('request.jwt.claims',${q(claims)},true); ${query}; commit;`;
}

let setupDone = false;
try {
  await sql(`
    begin;
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values
      (${q(ids.studentA)},'authenticated','authenticated',${q(`mdvoro-live-${ids.studentA}@example.invalid`)},'',now(),'{"full_name":"Live Test Student A"}',now(),now()),
      (${q(ids.studentB)},'authenticated','authenticated',${q(`mdvoro-live-${ids.studentB}@example.invalid`)},'',now(),'{"full_name":"Live Test Student B"}',now(),now()),
      (${q(ids.admin)},'authenticated','authenticated',${q(`mdvoro-live-${ids.admin}@example.invalid`)},'',now(),'{"full_name":"Live Test Admin"}',now(),now());
    update public.profiles set role='admin',leaderboard_visible=true where id=${q(ids.admin)};
    insert into public.exams(id,code,name) values(${q(ids.exam)},${q(`LIVE-${ids.exam.slice(0,8)}`)},'Temporary authorization test');
    insert into public.exam_profiles(exam_id,total_duration_minutes,max_items,block_duration_minutes,block_max_items,block_count)
    values(${q(ids.exam)},60,40,30,20,2);
    insert into public.questions(id,exam_id,stem,subject,topic,options,answer_key,explanation,difficulty,is_published,access_tier,workflow_status)
    values(${q(ids.question)},${q(ids.exam)},'Temporary security contract question stem','Live test','Authorization',
      '[{"id":"A","text":"Correct"},{"id":"B","text":"Incorrect"}]'::jsonb,'A','Temporary explanation',1,true,'free','published');
    insert into public.flashcards(id,owner_id,front,back) values
      (${q(ids.cardA)},${q(ids.studentA)},'A private front','A private back'),
      (${q(ids.cardB)},${q(ids.studentB)},'B private front','B private back');
    insert into public.study_plans(id,user_id,exam_id,target_date,daily_minutes) values
      (${q(ids.planA)},${q(ids.studentA)},${q(ids.exam)},current_date+30,30),
      (${q(ids.planB)},${q(ids.studentB)},${q(ids.exam)},current_date+45,45);
    commit;
  `);
  setupDone = true;

  // Cross-account visibility: own profile, card and plan only.
  const isolation = await sql(asUser(ids.studentA, `
    select
      (select count(*) from public.profiles where id in (${q(ids.studentA)},${q(ids.studentB)})) as profiles,
      (select count(*) from public.flashcards where id in (${q(ids.cardA)},${q(ids.cardB)})) as cards,
      (select count(*) from public.study_plans where id in (${q(ids.planA)},${q(ids.planB)})) as plans
  `));
  const iso = isolation.body.at(-1);
  if (Number(iso.profiles) !== 1 || Number(iso.cards) !== 1 || Number(iso.plans) !== 1) throw new Error(`account isolation failed: ${JSON.stringify(iso)}`);
  console.log('student cross-account RLS: PASS');

  // Attempts must be written through the authenticated RPC, never forged directly.
  console.log('checking direct attempt insert denial...');
  const directInsert = await sql(asUser(ids.studentA, `insert into public.question_attempts(user_id,question_id,selected_answer,is_correct) values(${q(ids.studentA)},${q(ids.question)},'A',true)`), { allowFailure: true });
  console.log('direct attempt insert response:', directInsert.ok);
  if (directInsert.ok) throw new Error('student could directly forge a question attempt');
  console.log('checking profile role escalation denial...');
  const roleEscalation = await sql(asUser(ids.studentA, `update public.profiles set role='admin' where id=${q(ids.studentA)}`), { allowFailure: true });
  console.log('profile role update response:', roleEscalation.ok);
  if (roleEscalation.ok) throw new Error('student role escalation unexpectedly succeeded');
  console.log('checking admin RPC denial...');
  const adminRpc = await sql(asUser(ids.studentA, `select public.admin_set_user_role_v2(${q(ids.studentB)},'admin'::public.user_role)`), { allowFailure: true });
  if (adminRpc.ok) throw new Error('student admin RPC unexpectedly succeeded');
  console.log('direct write and privilege escalation blocks: PASS');

  // Exercise the app's normal flashcard and study-plan RPCs under student claims.
  const createdCard = await sql(asUser(ids.studentA,
    `select public.create_flashcard(null,'Live test front','Live test back','basic','{}'::text[],null,null) as id`));
  const ownCardId = createdCard.body.at(-1)?.id;
  if (!ownCardId) throw new Error(`student flashcard creation failed: ${JSON.stringify(createdCard.body)}`);
  const review = await sql(asUser(ids.studentA,
    `select * from public.review_flashcard(${q(ownCardId)},3::smallint,1000,${q(randomUUID())}::uuid)`));
  if (!review.body.at(-1)?.card_id) throw new Error(`student flashcard review failed: ${JSON.stringify(review.body)}`);
  const crossReview = await sql(asUser(ids.studentA,
    `select * from public.review_flashcard(${q(ids.cardB)},3::smallint,1000,${q(randomUUID())}::uuid)`), { allowFailure: true });
  if (crossReview.ok) throw new Error('student could review another account\'s flashcard');
  const deleteOwn = await sql(asUser(ids.studentA, `select public.delete_own_flashcard(${q(ownCardId)}) as deleted`));
  if (deleteOwn.body.at(-1)?.deleted !== true) throw new Error('student could not delete own flashcard');
  const deleteOther = await sql(asUser(ids.studentA, `select public.delete_own_flashcard(${q(ids.cardB)}) as deleted`));
  if (deleteOther.body.at(-1)?.deleted !== false) throw new Error('student deleted another account\'s flashcard');
  await sql(asUser(ids.studentA, `select public.upsert_study_plan(${q(ids.exam)},(current_date+30)::date,25::smallint)`));
  await sql(asUser(ids.studentA, `select public.set_active_exam(${q(ids.exam)})`));
  console.log('flashcard create/review/delete and study-plan/account RPCs: PASS');

  // Rejected answer values must not create an attempt or reveal the answer.
  const invalidAnswer = await sql(asUser(ids.studentA,
    `select * from public.submit_question_answer(${q(ids.question)},'Z',100,3::smallint,${q(randomUUID())}::uuid)`), { allowFailure: true });
  if (invalidAnswer.ok) throw new Error('invalid answer option was accepted');
  console.log('invalid answer rejection: PASS');

  // Same idempotency key raced by 5 requests; 5 distinct mutations run alongside it.
  const requests = [
    ...Array.from({ length: 5 }, (_, i) => ({ mutation: randomUUID(), answer: i % 2 ? 'B' : 'A' })),
    ...Array.from({ length: 5 }, () => ({ mutation: ids.attemptRetry, answer: 'A' })),
  ];
  const outcomes = await Promise.all(requests.map(({ mutation, answer }, i) => sql(asUser(ids.studentA,
    `select * from public.submit_question_answer(${q(ids.question)},${q(answer)},${500+i},3::smallint,${q(mutation)}::uuid)`))));
  if (outcomes.some(x => !x.ok)) throw new Error('one or more concurrent answer submissions failed');
  console.log('concurrent answer submissions and idempotent retries: PASS');

  console.log('checking canonical event/projection counts...');
  const consistency = await sql(`select
      (select count(*) from public.question_attempts where user_id=${q(ids.studentA)} and question_id=${q(ids.question)}) as canonical_attempts,
      (select attempts from public.learner_question_stats where user_id=${q(ids.studentA)} and question_id=${q(ids.question)}) as question_projection,
      (select attempts from public.learner_exam_stats where user_id=${q(ids.studentA)} and exam_id=${q(ids.exam)}) as exam_projection,
      (select sum(attempts) from public.learner_exam_daily_stats where user_id=${q(ids.studentA)} and exam_id=${q(ids.exam)}) as daily_projection`);
  const stats = consistency.body.at(-1);
  for (const key of ['canonical_attempts','question_projection','exam_projection','daily_projection']) if (Number(stats[key]) !== 6) throw new Error(`concurrent projection mismatch: ${JSON.stringify(stats)}`);
  console.log('leaderboard/stat projections after concurrency: PASS');

  const visibility = await sql(asUser(ids.studentA, `select public.set_leaderboard_visibility(false)`));
  if (!visibility.ok) throw new Error('student could not change own leaderboard visibility');
  const boardClaims = JSON.stringify({ sub: ids.studentA, role: 'authenticated', aal: 'aal1' });
  const board = await sql(`begin; set local role authenticated; select set_config('request.jwt.claims',${q(boardClaims)},true); select display_name from public.public_leaderboard(${q(ids.exam)},'all_time','questions',50) where is_me=true; commit;`);
  if (!JSON.stringify(board.body).includes('Anonymous student')) throw new Error(`leaderboard privacy preference failed: ${JSON.stringify(board.body)}`);
  console.log('leaderboard privacy preference: PASS');

  const adminLow = await sql(asUser(ids.admin, `select public.has_permission('platform.users') as allowed`, 'aal1'));
  if (adminLow.body.at(-1).allowed !== false) throw new Error('admin access allowed without AAL2');
  const adminHigh = await sql(asUser(ids.admin, `select public.has_permission('platform.users') as allowed`, 'aal2'));
  if (adminHigh.body.at(-1).allowed !== true) throw new Error('admin access denied with AAL2');
  const adminUsers = await sql(asUser(ids.admin, `select id from public.admin_list_users(null,200,0) where id=${q(ids.studentA)}`, 'aal2'));
  if (!JSON.stringify(adminUsers.body).includes(ids.studentA)) throw new Error('MFA-authenticated admin cannot use admin user listing');
  const studentAdminUsers = await sql(asUser(ids.studentA, `select id from public.admin_list_users(null,200,0) where id=${q(ids.studentA)}`));
  const studentAdminRows = studentAdminUsers.body.filter(row => row && typeof row === 'object' && row.id === ids.studentA);
  if (studentAdminRows.length) throw new Error('student received admin user data');
  console.log('admin authorization, MFA gate, and student denial: PASS');
} catch (error) {
  console.error('LIVE AUTHORIZATION TEST FAILED:', error);
  process.exitCode = 1;
} finally {
  if (setupDone) {
    try {
      await sql(`begin; delete from auth.users where id in (${q(ids.studentA)},${q(ids.studentB)},${q(ids.admin)}); delete from public.questions where id=${q(ids.question)}; delete from public.exams where id=${q(ids.exam)}; commit;`);
      console.log('temporary test data cleanup: PASS');
    } catch (error) {
      console.error('TEMPORARY TEST DATA CLEANUP FAILED:', error);
      process.exitCode = 1;
    }
  }
}
