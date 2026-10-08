import { NextResponse } from 'next/server';
import { aiJobSchema } from '@/lib/validation/content';
import { requireContentEditor } from '@/lib/server/authorization';
import { aiProviderConfig, generateSuggestion, stablePromptHash } from '@/lib/ai/provider';
import { apiError, assertMutationRequest, readJson, enforceRateLimit, rejectOversizedJson } from '@/lib/server/api';
import { features } from '@/lib/config/features';
export async function POST(request: Request) {
    const blocked = assertMutationRequest(request);
    if (blocked)
        return blocked;
    if (!features.ai)
        return NextResponse.json({ error: 'feature_disabled', feature: 'ai' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const oversized = rejectOversizedJson(request, 220 * 1024);
    if (oversized)
        return oversized;
    try {
        const { supabase } = await requireContentEditor();
        await enforceRateLimit(supabase, 'admin_write', 30, 60);
        const parsed = aiJobSchema.parse(await readJson(request, 220 * 1024));
        const config = aiProviderConfig();
        const hash = stablePromptHash({ type: parsed.jobType, input: parsed.input });
        const { data: jobId, error } = await supabase.rpc('create_ai_generation_job', { p_question_id: parsed.questionId ?? null, p_job_type: parsed.jobType, p_provider: config.provider, p_model: config.model || 'configured', p_prompt_hash: hash, p_input: parsed.input });
        if (error)
            return NextResponse.json({ error: 'job_create_failed' }, { status: 400 });
        if (!config.configured)
            return NextResponse.json({ jobId, status: 'queued', configured: false, message: 'AI provider is not configured. No generation was attempted.' }, { status: 202 });
        try {
            const type = parsed.jobType === 'question_suggestion' ? 'question' : parsed.jobType === 'explanation_suggestion' ? 'explanation' : parsed.jobType === 'taxonomy_suggestion' ? 'taxonomy' : 'knowledge';
            const suggestion = await generateSuggestion({ type, input: parsed.input });
            const { data: suggestionId, error: completeError } = await supabase.rpc('complete_ai_generation_job', { p_job_id: jobId, p_suggestion_type: type, p_payload: suggestion });
            if (completeError)
                return NextResponse.json({ jobId, status: 'failed', error: 'suggestion_store_failed' }, { status: 500 });
            return NextResponse.json({ jobId, suggestionId, status: 'completed', configured: true, suggestion });
        }
        catch (e) {
            await supabase.rpc('fail_ai_generation_job', { p_job_id: jobId, p_error_code: e instanceof Error ? e.message : 'generation_failed' });
            return NextResponse.json({ jobId, status: 'failed', configured: true, error: 'generation_failed' }, { status: 502 });
        }
    }
    catch (error) {
        return apiError(error, 'ai_request_failed');
    }
}

