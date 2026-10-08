import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireContentEditor } from '@/lib/server/authorization';
import { assertSameOrigin } from '@/lib/security/origin';
import { apiError, enforceRateLimit } from '@/lib/server/api';
const LIMITS: Record<string, number> = {
    'image/jpeg': 10 * 1024 * 1024,
    'image/png': 10 * 1024 * 1024,
    'image/webp': 10 * 1024 * 1024,
    'image/gif': 10 * 1024 * 1024,
    'application/pdf': 15 * 1024 * 1024,
    'video/mp4': 60 * 1024 * 1024,
    'video/webm': 60 * 1024 * 1024,
    'audio/mpeg': 25 * 1024 * 1024,
    'audio/wav': 25 * 1024 * 1024,
};
function hasValidSignature(type: string, bytes: Uint8Array) {
    if (type === 'image/jpeg')
        return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (type === 'image/png')
        return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
    if (type === 'image/gif')
        return new TextDecoder().decode(bytes.slice(0, 6)) === 'GIF87a' || new TextDecoder().decode(bytes.slice(0, 6)) === 'GIF89a';
    if (type === 'image/webp')
        return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    if (type === 'application/pdf')
        return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
    if (type === 'video/mp4')
        return bytes.slice(4, 8).every((value, index) => value === [0x66, 0x74, 0x79, 0x70][index]) || new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';
    if (type === 'video/webm')
        return new TextDecoder().decode(bytes.slice(0, 4)) === '\x1A\x45\xDF\xA3';
    if (type === 'audio/mpeg')
        return (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || new TextDecoder().decode(bytes.slice(0, 3)) === 'ID3';
    if (type === 'audio/wav')
        return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WAVE';
    return false;
}
function extension(type: string, filename: string) {
    const known: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
    return known[type] ?? filename.split('.').pop()?.toLowerCase() ?? 'bin';
}
export async function POST(request: Request) {
    if (!assertSameOrigin(request))
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const rawContentLength = request.headers.get('content-length');
    const contentLength = Number(rawContentLength ?? 'NaN');
    if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > 65 * 1024 * 1024)
        return NextResponse.json({ error: 'request_too_large' }, { status: 413 });
    try {
        const { user } = await requireContentEditor();
        const supabase = await createClient();
        await enforceRateLimit(supabase, 'admin_upload', 30, 600);
        const form = await request.formData();
        const file = form.get('file');
        const title = String(form.get('title') ?? '').trim();
        const kind = String(form.get('kind') ?? 'image');
        const altText = String(form.get('altText') ?? '').trim();
        const licenseName = String(form.get('licenseName') ?? '').trim();
        const copyrightStatus = String(form.get('copyrightStatus') ?? 'review_required');
        const allowedKinds = new Set(['image', 'video', 'audio', 'document']);
        if (!allowedKinds.has(kind))
            return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
        if (!(file instanceof File) || !file.size)
            return NextResponse.json({ error: 'file_required' }, { status: 400 });
        if (!title || title.length > 180 || altText.length > 500 || licenseName.length > 180)
            return NextResponse.json({ error: 'invalid_title' }, { status: 400 });
        const max = LIMITS[file.type];
        if (!max)
            return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 });
        if (file.size > max)
            return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
        if (!['original', 'public_domain', 'licensed', 'review_required'].includes(copyrightStatus))
            return NextResponse.json({ error: 'invalid_copyright_status' }, { status: 400 });
        const path = `media/${crypto.randomUUID()}.${extension(file.type, file.name)}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!hasValidSignature(file.type, bytes))
            return NextResponse.json({ error: 'file_signature_mismatch' }, { status: 400 });
        const upload = await supabase.storage.from('medical-media').upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: '31536000' });
        if (upload.error)
            return NextResponse.json({ error: 'upload_failed' }, { status: 400 });
        const { data, error } = await supabase.rpc('admin_create_media', {
            p_kind: kind, p_title: title, p_alt_text: altText, p_external_url: '', p_storage_path: path,
            p_mime_type: file.type, p_source_id: null, p_license_name: licenseName, p_license_url: '',
            p_attribution_text: '', p_copyright_status: copyrightStatus, p_commercial_use_allowed: null, p_attribution_required: false,
        });
        if (error) {
            await supabase.storage.from('medical-media').remove([path]);
            return NextResponse.json({ error: 'asset_record_failed' }, { status: 400 });
        }
        return NextResponse.json({ id: data, path });
    }
    catch (error) {
        return apiError(error, 'upload_failed');
    }
}

