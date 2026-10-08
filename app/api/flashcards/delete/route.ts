import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson, rejectOversizedJson } from '@/lib/server/api';
const schema = z.object({ flashcardId: z.string().uuid() });
export async function DELETE(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  const oversized = rejectOversizedJson(request, 4096);
  if (oversized) return oversized;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'flashcard_delete', 30, 60);
    const v = schema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('delete_own_flashcard', { p_flashcard_id: v.flashcardId });
    if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 400 });
    return NextResponse.json({ deleted: Boolean(data) });
  } catch (error) {
    return apiError(error, 'delete_failed');
  }
}
