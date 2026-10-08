import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/authorization';
import { enforceRateLimit } from '@/lib/server/api';
export async function GET(request: Request) {
    try {
        const { supabase } = await requireStaff();
        await enforceRateLimit(supabase, 'admin_write', 240, 60);
        const url = new URL(request.url);
        const query = url.searchParams.get('q')?.trim().slice(0, 180) || null;
        const kind = url.searchParams.get('kind')?.trim().slice(0, 30) || null;
        const { data, error } = await supabase.rpc('admin_search_media', { p_search: query, p_kind: kind, p_limit: 50, p_offset: 0 });
        if (error)
            return NextResponse.json({ error: 'search_failed' }, { status: 400 });
        return NextResponse.json({ media: data ?? [] }, { headers: { 'Cache-Control': 'private, max-age=30' } });
    }
    catch {
        return NextResponse.json({ error: 'search_failed' }, { status: 403 });
    }
}

