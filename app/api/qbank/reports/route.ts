import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
import { qbankQuestionReportSchema } from '@/lib/validation/qbank';

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const input = qbankQuestionReportSchema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_feedback', 20, 60);
    const { data, error } = await supabase.from('qbank_question_reports').insert({ user_id: user.id, question_id: input.questionId, category: input.category, message: input.message }).select('id,status,reported_at').single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'qbank_report_save_failed');
  }
}
