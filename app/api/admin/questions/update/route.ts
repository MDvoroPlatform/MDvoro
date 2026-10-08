import { NextResponse } from 'next/server';
import { createQuestionSchema } from '@/lib/validation/content';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
import { z } from 'zod';
const schema = createQuestionSchema.safeExtend({ id: z.string().uuid() });
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { supabase } = await requireContentEditor();
        const body = await readJson(request);
        const v = schema.parse(body);
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { data, error } = await supabase.rpc('update_question_draft', {
            p_question_id: v.id, p_exam_id: v.examId, p_stem: v.stem, p_subject: v.subject, p_topic: v.topic,
            p_options: v.options, p_answer_key: v.answerKey, p_explanation: v.explanation,
            p_key_learning_point: v.keyLearningPoint, p_difficulty: v.difficulty ?? 3, p_media_ids: v.mediaIds,
        });
        if (error)
            return NextResponse.json({ error: 'update_failed' }, { status: 400 });
        return NextResponse.json({ id: v.id, versionId: data });
    }
    catch (error) {
        return apiError(error, 'update_failed');
    }
}

