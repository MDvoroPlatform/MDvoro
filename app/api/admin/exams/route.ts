import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';

const schema = z.object({
  examId: z.string().uuid(),
  totalDurationMinutes: z.number().int().min(1).max(1440),
  officialMaxItems: z.number().int().min(1).max(1000),
  productMaxItems: z.number().int().min(1).max(300),
  blockDurationMinutes: z.number().int().min(1).max(180),
  blockMaxItems: z.number().int().min(1).max(200),
  blockCount: z.number().int().min(1).max(64),
  breakMinutes: z.number().int().min(0).max(240),
  previousBlockReviewAllowed: z.boolean(),
  enabled: z.boolean(),
  timingVerified: z.boolean(),
  timingSource: z.string().trim().min(1).max(120),
  timingNotes: z.string().max(1000),
}).refine((value) => value.productMaxItems <= value.officialMaxItems, {
  message: 'product_cap_exceeds_official_limit',
  path: ['productMaxItems'],
});

export async function GET(request: Request) {
  try {
    const { supabase } = await requireSuperAdmin();
    const examId = new URL(request.url).searchParams.get('examId');
    if (!examId) return NextResponse.json({ error: 'exam_id_required' }, { status: 400 });
    const parsed = z.string().uuid().parse(examId);
    const { data, error } = await supabase.rpc('admin_exam_profile', { p_exam_id: parsed });
    if (error) return NextResponse.json({ error: 'exam_profile_failed' }, { status: 400 });
    return NextResponse.json(data?.[0] ?? null, { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    return apiError(error, 'exam_profile_failed');
  }
}

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { supabase } = await requireSuperAdmin();
    await enforceRateLimit(supabase, 'admin_write', 30, 60);
    const input = schema.parse(await readJson(request));
    const { error } = await supabase.rpc('admin_update_exam_profile', {
      p_exam_id: input.examId,
      p_total_duration_minutes: input.totalDurationMinutes,
      p_official_max_items: input.officialMaxItems,
      p_product_max_items: input.productMaxItems,
      p_block_duration_minutes: input.blockDurationMinutes,
      p_block_max_items: input.blockMaxItems,
      p_block_count: input.blockCount,
      p_break_minutes: input.breakMinutes,
      p_previous_block_review_allowed: input.previousBlockReviewAllowed,
      p_enabled: input.enabled,
      p_timing_verified: input.timingVerified,
      p_timing_source: input.timingSource,
      p_timing_notes: input.timingNotes || null,
    });
    if (error) {
      const code = error.message.includes('product_cap_exceeds_official_limit')
        ? 'product_cap_exceeds_official_limit'
        : error.message.includes('exam_profile_not_found')
          ? 'exam_profile_not_found'
          : 'exam_profile_update_failed';
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'exam_profile_update_failed');
  }
}
