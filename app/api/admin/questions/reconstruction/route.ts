import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson } from '@/lib/server/api';

const schema = z.object({
  questionId: z.string().uuid(),
  isReconstruction: z.boolean(),
  reconstructionYear: z.number().int().min(1900).max(2100).nullable(),
  reconstructionLabel: z.string().trim().max(80).nullable(),
});

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const { supabase } = await requireContentEditor();
    const p = schema.parse(await readJson(request));
    if (p.isReconstruction && p.reconstructionYear == null) {
      return NextResponse.json({ error: 'reconstruction_year_required' }, { status: 400 });
    }
    const { error } = await supabase.rpc('admin_set_question_reconstruction', {
      p_question_id: p.questionId,
      p_is_reconstruction: p.isReconstruction,
      p_reconstruction_year: p.reconstructionYear,
      p_reconstruction_label: p.reconstructionLabel ?? 'שחזור',
    });
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'reconstruction_failed');
  }
}
