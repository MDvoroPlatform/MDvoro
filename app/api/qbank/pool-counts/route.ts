import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';

const querySchema = z.object({
  examId: z.string().uuid(),
  subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  topics: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  reconstructionYear: z.number().int().min(1900).max(2100).nullable().optional(),
});

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_catalog', 60, 60);
    const parsed = querySchema.parse(await readJson(request));
    const { data, error } = parsed.reconstructionYear != null
      ? await supabase.rpc('qbank_reconstruction_pool_counts', { p_exam_id: parsed.examId, p_reconstruction_year: parsed.reconstructionYear, p_subjects: parsed.subjects, p_topics: parsed.topics })
      : await supabase.rpc('qbank_pool_counts', { p_exam_id: parsed.examId, p_subjects: parsed.subjects, p_topics: parsed.topics });
    if (error) return NextResponse.json({ error: 'pool_count_failed' }, { status: 400 });
    return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    return apiError(error, 'pool_count_failed');
  }
}
