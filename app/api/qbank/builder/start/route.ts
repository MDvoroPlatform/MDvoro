import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({
  examId: z.string().uuid(),
  allSources: z.boolean().default(true),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
  allDisciplines: z.boolean().default(true),
  fullSubjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  topicIds: z.array(z.string().uuid()).max(200).default([]),
  otherSubjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  status: z.enum(['all', 'unanswered', 'incorrect', 'saved', 'notes']).default('all'),
  difficulties: z.array(z.number().int().min(1).max(5)).max(5).default([]),
  questionCount: z.number().int().min(1).max(300),
  mode: z.enum(['practice', 'exam']),
});

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_next', 30, 60);
    const input = schema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('start_qbank_builder_session', {
      p_exam_id: input.examId,
      p_all_sources: input.allSources,
      p_source_ids: input.sourceIds,
      p_all_disciplines: input.allDisciplines,
      p_full_subjects: input.fullSubjects,
      p_topic_ids: input.topicIds,
      p_other_subjects: input.otherSubjects,
      p_status: input.status,
      p_difficulties: input.difficulties,
      p_question_count: input.questionCount,
      p_mode: input.mode,
    });
    if (error) {
      const code = error.message.includes('product_question_limit') ? 'exam_question_limit'
        : error.message.includes('exam_question_limit') ? 'exam_question_limit'
        : error.message.includes('insufficient_questions') ? 'insufficient_questions'
          : error.message.includes('account_inactive') ? 'account_inactive'
            : error.message.includes('invalid_subject') ? 'invalid_subject' : 'session_start_failed';
      return NextResponse.json({ error: code }, { status: 400 });
    }
    const row = data?.[0];
    if (!row?.session_id) return NextResponse.json({ error: 'session_start_failed' }, { status: 400 });
    return NextResponse.json({ sessionId: row.session_id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'session_start_failed');
  }
}
