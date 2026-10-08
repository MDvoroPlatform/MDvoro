import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson, rejectOversizedJson } from '@/lib/server/api';

const schema = z.object({ questionId: z.string().uuid() });

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  const oversized = rejectOversizedJson(request, 8 * 1024);
  if (oversized) return oversized;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    await enforceRateLimit(supabase, 'auth_mutation', 30, 60);
    const value = schema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('create_flashcard_from_question', { p_question_id: value.questionId });
    if (error) return NextResponse.json({ error: 'create_failed' }, { status: 400 });

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.card_id) return NextResponse.json({ error: 'create_failed' }, { status: 400 });
    return NextResponse.json({ id: row.card_id, created: row.created === true });
  } catch (error) {
    return apiError(error, 'create_failed');
  }
}
