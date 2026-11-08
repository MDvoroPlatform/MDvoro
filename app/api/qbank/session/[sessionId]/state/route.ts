import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sessionStateSchema } from '@/lib/validation/qbank';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

type SessionQuestionMedia = { id: string; external_url: string | null };
const elapsedMs = (startedAt: number) => Math.max(0, Number((performance.now() - startedAt).toFixed(1)));

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const url = new URL(request.url);
    const position = Number(url.searchParams.get('position') ?? '0');
    if (!Number.isSafeInteger(position) || position < 0) {
      return NextResponse.json({ error: 'invalid_position' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const prefetch = url.searchParams.get('prefetch') === '1';
    const compact = prefetch || url.searchParams.get('compact') === '1';
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

    const timings: Record<string, number> = {};
    const rpcStartedAt = performance.now();
    const { data, error } = compact
      ? await supabase.rpc('get_study_session_state_compact', { p_session_id: sessionId, p_position: position })
      : await supabase.rpc('get_study_session_state', { p_session_id: sessionId, p_position: position });
    timings.state_rpc = elapsedMs(rpcStartedAt);
    if (error) {
      const code = error.message.includes('block_closed') ? 'block_closed'
        : error.message.includes('block_not_open') ? 'block_not_open'
          : error.message.includes('session_expired') ? 'session_expired'
            : error.message.includes('on_break') ? 'on_break' : 'session_not_found';
      const status = code === 'session_expired' ? 410 : code === 'session_not_found' ? 404 : 409;
      return NextResponse.json({ error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
    }

    const question = data?.question as ({ id?: string; media?: SessionQuestionMedia[]; is_saved?: boolean } | null) | undefined;
    if (question?.id && !compact) {
      const bookmarkStartedAt = performance.now();
      const { data: bookmark, error: bookmarkError } = await supabase.from('question_bookmarks')
        .select('question_id').eq('user_id', user.id).eq('question_id', question.id).maybeSingle();
      if (bookmarkError) throw bookmarkError;
      question.is_saved = Boolean(bookmark);
      timings.bookmark = elapsedMs(bookmarkStartedAt);
    }

    const mediaNeedingSignatures = question?.media?.filter((asset) => !asset.external_url) ?? [];
    if (mediaNeedingSignatures.length) {
      const mediaPathsStartedAt = performance.now();
      const { data: storedMedia, error: mediaError } = await supabase.rpc('get_study_session_media_paths', {
        p_session_id: sessionId,
        p_position: data.session.current_position,
      });
      if (mediaError) throw mediaError;
      timings.media_paths = elapsedMs(mediaPathsStartedAt);
      const pathsById = new Map<string, string>();
      for (const asset of (storedMedia ?? []) as { id: string; storage_path: string | null }[]) {
        if (asset.storage_path) pathsById.set(asset.id, asset.storage_path);
      }
      const paths = [...new Set(mediaNeedingSignatures.map((asset) => pathsById.get(asset.id)).filter((path): path is string => Boolean(path)))];
      if (paths.length) {
        const signStartedAt = performance.now();
        const { data: signedMedia, error: signingError } = await supabase.storage.from('medical-media').createSignedUrls(paths, 3600);
        if (signingError) throw signingError;
        timings.sign_urls = elapsedMs(signStartedAt);
        const signedByPath = new Map<string, string>();
        for (const signed of signedMedia ?? []) {
          if (signed.path && signed.signedUrl) signedByPath.set(signed.path, signed.signedUrl);
          else if (signed.error) throw new Error('media_sign_failed');
        }
        question!.media = question!.media!.map((asset) => {
          const path = pathsById.get(asset.id);
          const signedUrl = path ? signedByPath.get(path) : undefined;
          return signedUrl ? { ...asset, external_url: signedUrl } : asset;
        });
      }
    }
    const serverTiming = Object.entries(timings).map(([name, duration]) => `${name};dur=${duration}`).join(', ');
    return NextResponse.json(data ?? null, { headers: { 'Cache-Control': 'private,no-store', 'Server-Timing': serverTiming } });
  } catch (error) {
    return apiError(error, 'session_load_failed');
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { sessionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_answer', 120, 60);
    const payload = sessionStateSchema.parse(await readJson(request));
    const { error } = await supabase.rpc('set_study_session_item_state', {
      p_session_id: sessionId,
      p_position: payload.position,
      p_marked: payload.marked ?? null,
      p_note: payload.note ?? null,
    });
    if (error) {
      const message = error.message;
      const code = message.includes('block_closed') ? 'block_closed'
        : message.includes('block_not_open') ? 'block_not_open'
          : message.includes('on_break') ? 'on_break'
            : message.includes('session_not_active') ? 'session_not_active' : 'state_update_failed';
      return NextResponse.json({ error: code }, { status: ['block_closed', 'block_not_open', 'on_break'].includes(code) ? 409 : 400 });
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'state_update_failed');
  }
}
