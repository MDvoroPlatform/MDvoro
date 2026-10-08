import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
const schema = z.object({ questionId: z.string().uuid(), taxonomyIds: z.array(z.string().uuid()).max(30) });
export async function POST(request: Request) { const blocked = assertMutationRequest(request); if (blocked)
    return blocked; try {
    const { supabase } = await requireContentEditor();
    const b = schema.parse(await readJson(request));
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const { error } = await supabase.rpc('set_question_taxonomy', { p_question_id: b.questionId, p_taxonomy_ids: b.taxonomyIds });
    if (error)
        return NextResponse.json({ error: 'save_failed' }, { status: 400 });
    return NextResponse.json({ ok: true });
}
catch (e) {
    return apiError(e, 'save_failed');
} }

