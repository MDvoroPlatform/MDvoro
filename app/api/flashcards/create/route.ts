import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson, rejectOversizedJson } from '@/lib/server/api';
const schema = z.object({ deckId: z.string().uuid().nullable().optional(), front: z.string().trim().min(1).max(10000), back: z.string().trim().min(1).max(20000), cardType: z.enum(['basic', 'cloze', 'image_occlusion', 'clinical', 'rapid_recall']).default('basic'), tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]), sourceQuestionId: z.string().uuid().nullable().optional(), knowledgeId: z.string().uuid().nullable().optional() });
export async function POST(request: Request) { const blocked = assertMutationRequest(request); if (blocked)
    return blocked; const oversized = rejectOversizedJson(request, 48 * 1024); if (oversized)
    return oversized; try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'auth_mutation', 60, 60);
    const v = schema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('create_flashcard', { p_deck_id: v.deckId ?? null, p_front: v.front, p_back: v.back, p_card_type: v.cardType, p_tags: v.tags, p_source_question_id: v.sourceQuestionId ?? null, p_knowledge_id: v.knowledgeId ?? null });
    if (error)
        return NextResponse.json({ error: 'create_failed' }, { status: 400 });
    return NextResponse.json({ id: data });
}
catch (e) {
    return apiError(e, 'create_failed');
} }

