import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentReviewer } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
const schema = z.object({ questionId: z.string().uuid(), decision: z.enum(['approved', 'changes_requested', 'rejected']), note: z.string().max(5000).optional().default('') });
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { supabase } = await requireContentReviewer();
        const parsed = schema.parse(await readJson(request));
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { error } = await supabase.rpc('review_question', { p_question_id: parsed.questionId, p_decision: parsed.decision, p_note: parsed.note });
        if (error)
            return NextResponse.json({ error: error.message === 'question_not_in_review' ? 'question_not_in_review' : 'review_failed' }, { status: 400 });
        return NextResponse.json({ ok: true });
    }
    catch (error) {
        return apiError(error, 'review_failed');
    }
}

