import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
const schema = z.object({
    name: z.string().trim().min(1).max(160),
    type: z.enum(['subject', 'topic', 'subtopic', 'concept', 'disease', 'drug', 'procedure']),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
});
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { supabase } = await requireStaff();
        const parsed = schema.parse(await readJson(request));
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { data, error } = await supabase.rpc('upsert_taxonomy_node', {
            p_name: parsed.name,
            p_node_type: parsed.type,
            p_slug: parsed.slug,
            p_parent_id: null,
            p_description: null,
            p_sort_order: 0,
        });
        if (error)
            return NextResponse.json({ error: 'Could not save taxonomy' }, { status: 400 });
        const { data: nodes, error: treeError } = await supabase.rpc('admin_taxonomy_tree', { p_parent_id: null });
        if (treeError)
            return NextResponse.json({ error: 'taxonomy_saved_but_refresh_failed' }, { status: 200 });
        const node = (nodes ?? []).find((x: {
            id: string;
        }) => x.id === data) ?? null;
        return NextResponse.json({ node });
    }
    catch (error) {
        return apiError(error, 'taxonomy_save_failed');
    }
}

