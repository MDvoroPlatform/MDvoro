import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentReviewer } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
const schema = z.object({ suggestionId: z.string().uuid(), status: z.enum(['accepted', 'edited', 'rejected']), note: z.string().max(5000).optional().default('') });
export async function POST(request: Request) { const blocked = assertMutationRequest(request); if (blocked)
    return blocked; try {
    const { supabase } = await requireContentReviewer();
    const v = schema.parse(await readJson(request));
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const { error } = await supabase.rpc('review_ai_suggestion', { p_suggestion_id: v.suggestionId, p_status: v.status, p_note: v.note });
    if (error)
        return NextResponse.json({ error: 'review_failed' }, { status: 400 });
    return NextResponse.json({ ok: true });
}
catch (e) {
    return apiError(e, 'review_failed');
} }

