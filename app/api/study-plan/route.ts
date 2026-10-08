import { NextResponse } from 'next/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson, rejectOversizedJson, noStoreJson } from '@/lib/server/api';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
const schema = z.object({ examId: z.string().uuid(), targetDate: z.string().date().nullable(), dailyMinutes: z.number().int().min(5).max(1440) });
export async function GET() { const s = await createClient(); const { data: { user } } = await s.auth.getUser(); if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); const { data, error } = await s.rpc('adaptive_study_plan'); if (error)
    return NextResponse.json({ error: 'plan_unavailable' }, { status: 500 }); return noStoreJson(data); }
export async function POST(req: Request) { const blocked = assertMutationRequest(req); if (blocked)
    return blocked; const oversized = rejectOversizedJson(req, 32 * 1024); if (oversized)
    return oversized; try {
    const s = await createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user)
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(s, 'auth_mutation', 30, 60);
    const parsed = schema.safeParse(await readJson(req, 32 * 1024));
    if (!parsed.success)
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const { data, error } = await s.rpc('upsert_study_plan', { p_exam_id: parsed.data.examId, p_target_date: parsed.data.targetDate, p_daily_minutes: parsed.data.dailyMinutes });
    if (error)
        return NextResponse.json({ error: 'plan_update_failed' }, { status: 400 });
    const { data: plan } = await s.rpc('adaptive_study_plan');
    return noStoreJson(plan ?? data);
}
catch (error) {
    return apiError(error, 'plan_update_failed');
} }

