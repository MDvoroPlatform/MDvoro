import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const schema = z.object({
  examId: z.string().uuid(),
  allSources: z.boolean().default(true),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
  allDisciplines: z.boolean().default(true),
  fullSubjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  topicIds: z.array(z.string().uuid()).max(200).default([]),
  otherSubjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  status: z.enum(['all', 'unanswered', 'incorrect', 'saved', 'notes']).default('all'),
  difficulties: z.array(z.number().int().min(1).max(5)).max(5).default([]),
});

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_catalog', 60, 60);
    const input = schema.parse(await readJson(request));
    const { data, error } = await supabase.rpc('qbank_builder_filter_tree', {
      p_exam_id: input.examId,
      p_all_sources: input.allSources,
      p_source_ids: input.sourceIds,
      p_all_disciplines: input.allDisciplines,
      p_full_subjects: input.fullSubjects,
      p_topic_ids: input.topicIds,
      p_other_subjects: input.otherSubjects,
      p_status: input.status,
      p_difficulties: input.difficulties,
    });
    if (error) return NextResponse.json({ error: 'filter_tree_failed' }, { status: 400 });
    return NextResponse.json(data ?? { sources: [], disciplines: [], available: 0 }, {
      headers: { 'Cache-Control': 'private,no-store' },
    });
  } catch (error) {
    return apiError(error, 'filter_tree_failed');
  }
}
