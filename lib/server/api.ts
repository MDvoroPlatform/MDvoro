import { NextResponse } from 'next/server';
import { AuthorizationError } from '@/lib/server/authorization';
import { assertSameOrigin } from '@/lib/security/origin';
import { ZodError } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log, requestId } from '@/lib/server/logger';
export function assertMutationRequest(request: Request): NextResponse | null {
    const id = request.headers.get('x-request-id')?.trim().slice(0, 80) || requestId();
    if (!assertSameOrigin(request))
        return NextResponse.json({ error: 'forbidden', requestId: id }, { status: 403, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': id } });
    return null;
}
export async function readJson<T = unknown>(request: Request, maxBytes = 256 * 1024): Promise<T | null> {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json'))
        return null;
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
        throw new RequestBodyTooLargeError();
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > maxBytes)
        throw new RequestBodyTooLargeError();
    try {
        return JSON.parse(new TextDecoder().decode(bytes)) as T;
    }
    catch {
        return null;
    }
}
export function apiError(error: unknown, fallback = 'request_failed') {
    const id = requestId();
    if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.code, requestId: id }, { status: error.code === 'unauthorized' ? 401 : 403, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': id } });
    }
    if (error instanceof RequestBodyTooLargeError)
        return NextResponse.json({ error: 'payload_too_large', requestId: id }, { status: 413, headers: { 'X-Request-ID': id } });
    if (error instanceof RateLimitError)
        return NextResponse.json({ error: 'rate_limited', requestId: id }, { status: 429, headers: { 'Retry-After': '60', 'X-Request-ID': id } });
    if (error instanceof ZodError)
        return NextResponse.json({ error: 'invalid_request', requestId: id }, { status: 400, headers: { 'X-Request-ID': id } });
    log('error', fallback, { request_id: id, error });
    return NextResponse.json({ error: fallback, requestId: id }, { status: 500, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': id } });
}
export function noStoreJson(body: unknown, init?: ResponseInit) {
    const id = requestId();
    return NextResponse.json(body, {
        ...init,
        headers: { 'Cache-Control': 'private, no-store', 'X-Request-ID': id, ...(init?.headers ?? {}) },
    });
}
export async function enforceRateLimit(supabase: Awaited<ReturnType<typeof createClient>>, action: 'qbank_answer' | 'qbank_next' | 'qbank_catalog' | 'qbank_break' | 'flashcard_review' | 'flashcard_delete' | 'admin_write' | 'admin_upload' | 'auth_mutation', limit: number, windowSeconds: number) {
    const { data, error } = await supabase.rpc('consume_rate_limit', { p_action: action, p_limit: limit, p_window_seconds: windowSeconds });
    if (error || data !== true)
        throw new RateLimitError();
}
export class RateLimitError extends Error {
    constructor() { super('rate_limited'); this.name = 'RateLimitError'; }
}
export class RequestBodyTooLargeError extends Error {
    constructor() { super('payload_too_large'); this.name = 'RequestBodyTooLargeError'; }
}
export function rejectOversizedJson(request: Request, maxBytes: number): NextResponse | null {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) {
        const id = requestId();
        return NextResponse.json({ error: 'payload_too_large', requestId: id }, { status: 413, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': id } });
    }
    return null;
}

