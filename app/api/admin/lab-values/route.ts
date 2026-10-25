import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';
import { adminLabValueSchema } from '@/lib/validation/qbank';

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { supabase } = await requireRole(['super_admin','admin','editor','reviewer']);
    const value = adminLabValueSchema.parse(await readJson(request));
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const { data, error } = await supabase.rpc('admin_upsert_lab_value', {
      p_id: value.id,
      p_name: value.name,
      p_category: value.category,
      p_reference_range: value.referenceRange,
      p_unit: value.unit,
      p_si_reference_range: value.siReferenceRange,
      p_si_unit: value.siUnit,
      p_population: value.population,
      p_source_reference: value.sourceReference,
      p_review_note: value.reviewNote || null,
      p_status: value.status,
    });
    if (error) return NextResponse.json({ error: error.message === 'source_required_for_approval' ? 'source_required_for_approval' : 'lab_value_save_failed' }, { status: 400 });
    return NextResponse.json({ ok: true, id: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'lab_value_save_failed');
  }
}
