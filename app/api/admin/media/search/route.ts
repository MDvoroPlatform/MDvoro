import { NextResponse } from 'next/server';
import { requireContentEditor } from '@/lib/server/authorization';
import { enforceRateLimit } from '@/lib/server/api';
export async function GET(request: Request) {
    try {
        const { supabase } = await requireContentEditor();
        await enforceRateLimit(supabase, 'admin_write', 240, 60);
        const url = new URL(request.url);
        const query = url.searchParams.get('q')?.trim().slice(0, 180) || null;
        const kind = url.searchParams.get('kind')?.trim().slice(0, 30) || null;
        const { data, error } = await supabase.rpc('admin_search_media', { p_search: query, p_kind: kind, p_limit: 50, p_offset: 0 });
        if (error)
            return NextResponse.json({ error: 'search_failed' }, { status: 400 });
        const media = await Promise.all(((data ?? []) as { id: string; kind: string; title: string; external_url: string | null; storage_path: string | null; license_name: string | null; copyright_status: string; attribution_required: boolean; usage_count: number; created_at: string }[]).map(async (asset) => {
            if (!asset.storage_path)
                return { ...asset, url: asset.external_url || null };
            const { data: signed } = await supabase.storage.from('medical-media').createSignedUrl(asset.storage_path, 15 * 60);
            return { ...asset, url: signed?.signedUrl ?? null };
        }));
        return NextResponse.json({ media }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch {
        return NextResponse.json({ error: 'search_failed' }, { status: 403 });
    }
}

