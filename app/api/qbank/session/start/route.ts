import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startSessionSchema } from '@/lib/validation/qbank';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
export async function POST(request: Request) {
  const blocked = assertMutationRequest(request); if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data:{user} } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({error:'unauthorized'},{status:401});
    await enforceRateLimit(supabase,'qbank_next',30,60);
    const parsed = startSessionSchema.parse(await readJson(request));
    const { data,error } = parsed.reconstructionYear != null
      ? await supabase.rpc('start_reconstruction_session', {
          p_exam_id: parsed.examId, p_subjects: parsed.subjects, p_topics: parsed.topics,
          p_question_count: parsed.questionCount, p_mode: parsed.mode, p_pool: parsed.pool,
          p_reconstruction_year: parsed.reconstructionYear
        })
      : await supabase.rpc('start_study_session', {
          p_exam_id: parsed.examId, p_subjects: parsed.subjects, p_topics: parsed.topics,
          p_question_count: parsed.questionCount, p_mode: parsed.mode, p_pool: parsed.pool
        });
    if (error) {
      const code = error.message.includes('exam_question_limit') ? 'exam_question_limit' : error.message.includes('insufficient_questions') ? 'insufficient_questions' : error.message.includes('invalid_subject') ? 'invalid_subject' : error.message.includes('account_inactive') ? 'account_inactive' : 'session_start_failed';
      return NextResponse.json({error:code},{status:400});
    }
    const row = data?.[0];
    return NextResponse.json({sessionId:row.session_id,timeLimitSeconds:row.time_limit_seconds,blockCount:row.block_count,blockDurationMinutes:row.block_duration_minutes,blockMaxItems:row.block_max_items},{headers:{'Cache-Control':'no-store'}});
  } catch (error) { return apiError(error,'session_start_failed'); }
}
