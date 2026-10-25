import { NextResponse } from 'next/server';
import { requireContentReviewer } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
import { adminQbankQuestionReportUpdateSchema } from '@/lib/validation/qbank';

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { supabase } = await requireContentReviewer();
    const input = adminQbankQuestionReportUpdateSchema.parse(await readJson(request));
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const { error } = await supabase.rpc('admin_update_qbank_question_report', { p_report_id: input.reportId, p_status: input.status, p_note: input.note || null });
    if (error) return NextResponse.json({ error: error.message === 'report_not_found' ? 'report_not_found' : 'report_update_failed' }, { status: error.message === 'report_not_found' ? 404 : 400 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'report_update_failed');
  }
}
