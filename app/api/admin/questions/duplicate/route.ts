import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
const schema = z.object({ questionId: z.string().uuid() });
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { supabase } = await requireContentEditor();
        const { questionId } = schema.parse(await readJson(request));
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { data, error } = await supabase.rpc('admin_duplicate_question', { p_question_id: questionId });
        if (error)
            return NextResponse.json({ error: 'duplicate_failed' }, { status: 400 });
        return NextResponse.json({ id: data });
    }
    catch (error) {
        return apiError(error, 'duplicate_failed');
    }
}

