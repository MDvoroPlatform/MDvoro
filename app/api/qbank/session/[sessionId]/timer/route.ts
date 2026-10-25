import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({ action: z.enum(['pause','resume']) });
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { sessionId } = await params;
    z.string().uuid().parse(sessionId);
    const input = schema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_break', 30, 60);
    const { error } = await supabase.rpc(input.action === 'pause' ? 'pause_practice_session' : 'resume_practice_session', { p_session_id: sessionId });
    if (error) return NextResponse.json({ error: 'practice_timer_update_failed' }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'practice_timer_update_failed');
  }
}
