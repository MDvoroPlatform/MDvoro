import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit } from '@/lib/server/api';

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { sessionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_break', 20, 60);
    const { data, error } = await supabase.rpc('start_exam_break', { p_session_id: sessionId });
    if (error) {
      const message = error.message;
      const code = message.includes('break_not_available') ? 'break_not_available' : message.includes('session_expired') ? 'session_expired' : 'break_start_failed';
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json(data?.[0] ?? null, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'break_start_failed');
  }
}
