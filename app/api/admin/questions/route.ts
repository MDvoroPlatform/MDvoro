import { NextResponse } from 'next/server';
import { createQuestionSchema } from '@/lib/validation/content';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    try {
        const { user, supabase } = await requireContentEditor();
        const body = await readJson(request);
        const parsed = createQuestionSchema.parse(body);
        await enforceRateLimit(supabase, 'admin_write', 120, 60);
        const { data, error } = await supabase.rpc('create_question', {
            p_exam_id: parsed.examId, p_stem: parsed.stem, p_subject: parsed.subject,
            p_topic: parsed.topic, p_options: parsed.options, p_answer_key: parsed.answerKey,
            p_explanation: parsed.explanation, p_key_learning_point: parsed.keyLearningPoint,
            p_difficulty: parsed.difficulty ?? 3, p_media_ids: parsed.mediaIds,
        });
        if (error)
            return NextResponse.json({ error: 'create_failed' }, { status: 400 });
        return NextResponse.json({ id: data, createdBy: user.id });
    }
    catch (error) {
        return apiError(error, 'create_failed');
    }
}

