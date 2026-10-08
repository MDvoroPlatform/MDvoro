import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('exams').select('id').limit(1);
    if (error) {
      return NextResponse.json({ ok: false, service: 'mdvoro-web', check: 'readiness' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ok: true, service: 'mdvoro-web', check: 'readiness' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, service: 'mdvoro-web', check: 'readiness' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
