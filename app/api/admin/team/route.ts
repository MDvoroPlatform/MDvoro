import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
const schema = z.object({ userId: z.string().uuid(), role: z.enum(['student', 'admin', 'editor', 'reviewer', 'support', 'super_admin']) });
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { supabase } = await requireAdmin();
        const parsed = schema.parse(await readJson(request));
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: parsed.userId, p_role: parsed.role });
        if (error)
            return NextResponse.json({ error: error.message === 'last_admin_protected' ? 'last_admin_protected' : 'role_change_failed' }, { status: 400 });
        return NextResponse.json({ ok: true });
    }
    catch (error) {
        return apiError(error, 'role_change_failed');
    }
}

