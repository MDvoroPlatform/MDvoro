import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { apiError, assertMutationRequest, enforceRateLimit, readJson, rejectOversizedJson } from '@/lib/server/api';
const schema = z.object({ examId: z.string().uuid() });
export async function POST(request: Request) { const blocked = assertMutationRequest(request); if (blocked)
    return blocked; const oversized = rejectOversizedJson(request, 8 * 1024); if (oversized)
    return oversized; try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'auth_mutation', 60, 60);
    const parsed = schema.parse(await readJson(request, 8 * 1024));
    const { error } = await supabase.rpc('set_active_exam', { target_exam: parsed.examId });
    if (error)
        return NextResponse.json({ error: 'save_failed' }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
catch (e) {
    return apiError(e, 'save_failed');
} }

