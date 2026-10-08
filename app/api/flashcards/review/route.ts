import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson, rejectOversizedJson } from '@/lib/server/api';
const schema = z.object({
    flashcardId: z.string().uuid(),
    rating: z.number().int().min(0).max(4),
    durationMs: z.number().int().min(0).max(3600000).optional(),
    mutationId: z.string().uuid(),
});
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    const oversized = rejectOversizedJson(request, 16 * 1024);
    if (oversized)
        return oversized;
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        await enforceRateLimit(supabase, 'flashcard_review', 120, 60);
        const parsed = schema.parse(await readJson(request, 16 * 1024));
        const { data, error } = await supabase.rpc('review_flashcard', {
            p_flashcard_id: parsed.flashcardId,
            p_rating: parsed.rating,
            p_duration_ms: parsed.durationMs ?? null,
            p_client_mutation_id: parsed.mutationId,
        });
        if (error) {
            if (error.message.includes('mutation_id_reused'))
                return NextResponse.json({ error: 'mutation_id_reused' }, { status: 409 });
            if (error.message.includes('card_not_found'))
                return NextResponse.json({ error: 'card_not_found' }, { status: 404 });
            if (error.message.includes('card_suspended'))
                return NextResponse.json({ error: 'card_suspended' }, { status: 409 });
            return NextResponse.json({ error: 'review_failed' }, { status: 400 });
        }
        return NextResponse.json({ result: data?.[0] ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        return apiError(error, 'review_failed');
    }
}

