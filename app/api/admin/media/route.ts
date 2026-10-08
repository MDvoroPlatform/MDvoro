import { NextResponse } from 'next/server';
import { mediaSchema } from '@/lib/validation/content';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { supabase } = await requireContentEditor();
        const v = mediaSchema.parse(await readJson(request));
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { data, error } = await supabase.rpc('admin_create_media', {
            p_kind: v.kind, p_title: v.title, p_alt_text: v.altText, p_external_url: v.externalUrl, p_storage_path: v.storagePath,
            p_mime_type: v.mimeType, p_source_id: v.sourceId ?? null, p_license_name: v.licenseName, p_license_url: v.licenseUrl,
            p_attribution_text: v.attributionText, p_copyright_status: v.copyrightStatus, p_commercial_use_allowed: v.commercialUseAllowed,
            p_attribution_required: v.attributionRequired,
        });
        if (error)
            return NextResponse.json({ error: 'create_failed' }, { status: 400 });
        return NextResponse.json({ id: data });
    }
    catch (error) {
        return apiError(error, 'create_failed');
    }
}

