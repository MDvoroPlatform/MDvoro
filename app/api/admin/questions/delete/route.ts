import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({ questionId: z.string().uuid() });

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;

  try {
    const { supabase } = await requireAdmin();
    await enforceRateLimit(supabase, 'admin_write', 60, 60);
    const { questionId } = schema.parse(await readJson(request));
    const { error } = await supabase.rpc('admin_delete_question', { p_question_id: questionId });
    if (error) {
      const code = error.message.includes('question_in_use') ? 'question_in_use'
        : error.message.includes('question_not_found') ? 'question_not_found' : 'question_delete_failed';
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'question_delete_failed');
  }
}
