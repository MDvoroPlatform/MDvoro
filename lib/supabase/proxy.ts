import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const protectedPageRoots = [
    '/admin', '/analytics', '/dashboard', '/exam-guide', '/flashcards',
    '/knowledge', '/leaderboard', '/library', '/notebook', '/qbank',
    '/settings', '/study-plan',
];

function isProtectedPage(pathname: string) {
    return protectedPageRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function securityPolicy(nonce: string) {
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
        `style-src 'self' 'nonce-${nonce}'`,
        "img-src 'self' data: blob: https://*.supabase.co https://challenges.cloudflare.com",
        "font-src 'self' data:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
        "frame-src 'self' https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'", "base-uri 'self'", "form-action 'self'",
        "frame-ancestors 'none'", "upgrade-insecure-requests"
    ].join('; ');
}
export async function updateSession(request: NextRequest) {
    const nonce = btoa(crypto.randomUUID());
    const requestId = crypto.randomUUID();
    const csp = securityPolicy(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('x-request-id', requestId);
    requestHeaders.set('Content-Security-Policy', csp);
    let response = NextResponse.next({ request: { headers: requestHeaders } });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'configuration_error', requestId }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                response = NextResponse.next({ request: { headers: requestHeaders } });
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            }
        }
    });
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('x-nonce', nonce);
    response.headers.set('x-request-id', requestId);
    // This is only an optimistic page-navigation redirect. Protected layouts and
    // API handlers still perform full user, role, MFA, and database checks.
    if (isProtectedPage(request.nextUrl.pathname) && !claims?.sub) {
        return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
}

