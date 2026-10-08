import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/server/authorization';
import { assertMutationRequest, readJson, rejectOversizedJson } from '@/lib/server/api';
import { z } from 'zod';

const schema = z.object({ enabled: z.boolean() });

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_public_site_status');
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  return NextResponse.json({ underConstruction: Boolean(data?.[0]?.under_construction) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  const oversized = rejectOversizedJson(request, 4096);
  if (oversized) return oversized;
  try {
    const { supabase } = await requireSuperAdmin();
    const body = schema.parse(await readJson(request));
    const { error } = await supabase.rpc('admin_set_under_construction', { p_enabled: body.enabled });
    if (error) return NextResponse.json({ error: 'update_failed' }, { status: 400 });
    return NextResponse.json({ ok: true, underConstruction: body.enabled });
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
}
