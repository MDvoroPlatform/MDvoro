import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({ versionId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { questionId } = await params;
    const { supabase } = await requireAdmin();
    const { versionId } = schema.parse(await readJson(request));
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const { data, error } = await supabase.rpc('admin_restore_question_version', { p_question_id: questionId, p_version_id: versionId });
    if (error) return NextResponse.json({ error: 'restore_failed' }, { status: 400 });
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return apiError(error, 'restore_failed');
  }
}
