import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
import { qbankQuestionRatingSchema } from '@/lib/validation/qbank';
import { z } from 'zod';

export async function GET(request: Request) {
  try {
    const questionId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('questionId'));
    if (!questionId.success) return NextResponse.json({ error: 'invalid_question_id' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data, error } = await supabase.from('qbank_question_ratings').select('rating').eq('user_id', user.id).eq('question_id', questionId.data).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ rating: data?.rating ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'qbank_rating_load_failed');
  }
}

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const input = qbankQuestionRatingSchema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_feedback', 60, 60);
    const { error } = await supabase.from('qbank_question_ratings').upsert({ user_id: user.id, question_id: input.questionId, rating: input.rating }, { onConflict: 'user_id,question_id' });
    if (error) throw error;
    return NextResponse.json({ ok: true, rating: input.rating }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'qbank_rating_save_failed');
  }
}
