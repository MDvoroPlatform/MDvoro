import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
function safeNext(value: string | null) {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
        return '/dashboard';
    return value;
}
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code)
        return NextResponse.redirect(new URL('/login', url.origin));
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
        return NextResponse.redirect(new URL('/login?error=auth', url.origin));
    return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url.origin));
}

