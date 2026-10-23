import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, enforceRateLimit } from '@/lib/server/api';
import { normalizeMedicalSearchQuery } from '@/lib/search/medical-query';

export async function GET(request: Request) {
  try {
    const query = normalizeMedicalSearchQuery(new URL(request.url).searchParams.get('q') ?? '');
    if (query.length < 4) return NextResponse.json([], { headers: { 'Cache-Control': 'private, no-store' } });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_catalog', 60, 60);
    const { data, error } = await supabase.rpc('student_search_questions', { p_query: query, p_limit: 15 });
    if (error) return NextResponse.json({ error: 'search_failed' }, { status: 400 });
    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'question_search_failed');
  }
}
