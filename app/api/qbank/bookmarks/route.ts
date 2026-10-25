import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({ questionId: z.string().uuid(), saved: z.boolean() });

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const input = schema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'auth_mutation', 60, 60);

    const { data, error } = await supabase.rpc('set_question_bookmark', {
      p_question_id: input.questionId,
      p_saved: input.saved,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, saved: data === true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'bookmark_update_failed');
  }
}
