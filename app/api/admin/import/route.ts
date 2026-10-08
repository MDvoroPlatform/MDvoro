import { NextResponse } from 'next/server';
import { createQuestionSchema } from '@/lib/validation/content';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit, rejectOversizedJson } from '@/lib/server/api';
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    const oversized = rejectOversizedJson(request, 12 * 1024 * 1024);
    if (oversized)
        return oversized;
    try {
        const { supabase } = await requireContentEditor();
        await enforceRateLimit(supabase, 'admin_write', 30, 60);
        const body = await readJson(request, 12 * 1024 * 1024);
        if (!Array.isArray(body))
            return NextResponse.json({ error: 'payload_must_be_array' }, { status: 400 });
        if (body.length > 2000)
            return NextResponse.json({ error: 'import_limit_exceeded' }, { status: 400 });
        const parsed = body.map((item, index) => {
            const result = createQuestionSchema.safeParse(item);
            return result.success ? { ok: true as const, value: result.data } : { ok: false as const, index };
        });
        const invalid = parsed.filter((item) => !item.ok);
        if (invalid.length)
            return NextResponse.json({ error: 'validation_failed', invalid }, { status: 400 });
        const payload = parsed.map((item) => item.ok ? item.value : null);
        const { data, error } = await supabase.rpc('import_questions', { p_items: payload });
        if (error)
            return NextResponse.json({ error: 'import_failed' }, { status: 400 });
        return NextResponse.json({ imported: data });
    }
    catch (error) {
        return apiError(error, 'import_failed');
    }
}

