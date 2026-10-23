import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({ title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { supabase } = await requireAdmin();
    await enforceRateLimit(supabase, 'admin_write', 30, 60);
    const body = schema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('admin_send_announcement', { p_title: body.title, p_message: body.message });
    if (error) return NextResponse.json({ error: 'announcement_failed' }, { status: 400 });
    return NextResponse.json({ ok: true, id: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'announcement_failed');
  }
}
