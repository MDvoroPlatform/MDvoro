import { NextResponse } from 'next/server';
import { knowledgeCardSchema } from '@/lib/validation/content';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
export async function POST(request: Request) { const blocked = assertMutationRequest(request); if (blocked)
    return blocked; try {
    const { supabase } = await requireContentEditor();
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const body = knowledgeCardSchema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('create_knowledge_card', { p_title: body.title, p_summary: body.summary, p_body_md: body.bodyMd });
    if (error)
        return NextResponse.json({ error: 'create_failed' }, { status: 400 });
    return NextResponse.json({ id: data });
}
catch (error) {
    return apiError(error, 'create_failed');
} }

