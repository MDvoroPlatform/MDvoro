import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const questionRightsSchema = z.object({
    questionId: z.string().uuid(),
    rightsBasis: z.enum(['original', 'licensed', 'permission', 'public_domain', 'user_submitted', 'unknown']),
    sourceReference: z.string().trim().max(2000).default(''),
});

export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked) return blocked;
    try {
        const { supabase } = await requireContentEditor();
        const input = questionRightsSchema.parse(await readJson(request));
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { error } = await supabase.rpc('admin_upsert_question_rights', {
            p_question_id: input.questionId,
            p_rights_basis: input.rightsBasis,
            p_source_name: null,
            p_source_year: null,
            p_source_reference: input.sourceReference || null,
            p_attribution: null,
            p_verified: false,
            p_notes: null,
        });
        if (error) return NextResponse.json({ error: 'save_failed' }, { status: 400 });
        return NextResponse.json({ saved: true });
    } catch (error) {
        return apiError(error, 'save_failed');
    }
}
