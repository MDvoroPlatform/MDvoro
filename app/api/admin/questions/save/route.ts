import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createQuestionSchema } from '@/lib/validation/content';
import { requireAdmin, requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const saveSchema = createQuestionSchema.safeExtend({
  id: z.string().uuid().optional(),
  taxonomyIds: z.array(z.string().uuid()).max(30).default([]),
  keyTerms: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
  isReconstruction: z.boolean().default(false),
  reconstructionYear: z.number().int().min(1900).max(2100).nullable().optional(),
  reconstructionLabel: z.string().trim().max(80).nullable().optional(),
  rightsBasis: z.enum(['original', 'licensed', 'permission', 'public_domain', 'user_submitted', 'unknown']).default('unknown'),
  sourceReference: z.string().trim().max(2000).default(''),
  publishNow: z.boolean().default(false),
});

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const body = saveSchema.parse(await readJson(request));
    const { supabase, user } = body.publishNow ? await requireAdmin() : await requireContentEditor();
    await enforceRateLimit(supabase, 'admin_write', 120, 60);
    const { data, error } = await supabase.rpc('admin_save_question', {
      p_question_id: body.id ?? null,
      p_exam_id: body.examId,
      p_stem: body.stem,
      p_subject: body.subject,
      p_topic: body.topic,
      p_options: body.options,
      p_answer_key: body.answerKey,
      p_explanation: body.explanation,
      p_key_learning_point: body.keyLearningPoint,
      p_difficulty: body.difficulty ?? 3,
      p_media_ids: body.mediaIds,
      p_taxonomy_ids: body.taxonomyIds,
      p_key_terms: body.keyTerms,
      p_is_reconstruction: body.isReconstruction,
      p_reconstruction_year: body.reconstructionYear ?? null,
      p_reconstruction_label: body.reconstructionLabel ?? 'שחזור',
      p_rights_basis: body.rightsBasis,
      p_source_reference: body.sourceReference,
      p_publish: body.publishNow,
    });
    if (error) {
      const knownErrors = [
        'forbidden', 'exam_not_found', 'question_not_found', 'invalid_options', 'answer_not_in_options',
        'too_many_taxonomy_nodes', 'taxonomy_not_found', 'reconstruction_year_required',
        'admin_required_for_published_question_edit', 'legacy_role_disabled',
      ];
      const code = knownErrors.find((candidate) => error.message.includes(candidate)) ?? 'save_failed';
      return NextResponse.json({ error: code }, { status: code === 'forbidden' || code === 'admin_required_for_published_question_edit' ? 403 : 400 });
    }
    return NextResponse.json({ ...data, createdBy: user.id });
  } catch (error) {
    return apiError(error, 'save_failed');
  }
}
