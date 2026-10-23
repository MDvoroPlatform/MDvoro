import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, readJson } from '@/lib/server/api';

const readSchema = z.object({ key: z.string().min(1).max(120) });

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data, error } = await supabase.rpc('my_notifications');
    if (error) return NextResponse.json({ error: 'notifications_failed' }, { status: 400 });
    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'notifications_failed');
  }
}

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { key } = readSchema.parse(await readJson(request));
    const { error } = await supabase.rpc('mark_my_notification_read', { p_notification_key: key });
    if (error) return NextResponse.json({ error: 'notification_update_failed' }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'notification_update_failed');
  }
}
