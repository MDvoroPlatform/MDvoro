import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, enforceRateLimit, readJson } from '@/lib/server/api';

const segmentSchema = z.string().regex(/^(stem|explanation|key_learning_point|option:[A-Z])$/);
const colorSchema = z.enum(['yellow', 'green', 'blue', 'pink', 'orange']);
const createSchema = z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid(),
  segmentKey: segmentSchema,
  quote: z.string().trim().min(1).max(2000),
  prefix: z.string().max(80),
  suffix: z.string().max(80),
  startOffset: z.number().int().min(0).max(200000),
  endOffset: z.number().int().min(1).max(202000),
  color: colorSchema,
  note: z.string().max(1000).nullable().optional(),
}).refine((value) => value.endOffset > value.startOffset && value.endOffset - value.startOffset === value.quote.length, { path: ['endOffset'] });
const updateSchema = z.object({ id: z.string().uuid(), color: colorSchema.optional(), note: z.string().max(1000).nullable().optional() })
  .refine((value) => value.color !== undefined || value.note !== undefined);
const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const questionId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('questionId'));
    if (!questionId.success) return NextResponse.json({ error: 'invalid_question_id' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data, error } = await supabase.from('question_annotations').select('id,question_id,segment_key,quote,prefix,suffix,start_offset,end_offset,color,note,anchor_version').eq('user_id', user.id).eq('question_id', questionId.data).order('segment_key').order('start_offset');
    if (error) throw error;
    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'annotations_load_failed');
  }
}

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const input = createSchema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_annotation', 120, 60);
    const { data, error } = await supabase.from('question_annotations').insert({
      id: input.id,
      user_id: user.id,
      question_id: input.questionId,
      segment_key: input.segmentKey,
      quote: input.quote,
      prefix: input.prefix,
      suffix: input.suffix,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      color: input.color,
      note: input.note?.trim() || null,
    }).select('id,question_id,segment_key,quote,prefix,suffix,start_offset,end_offset,color,note,anchor_version').single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'annotation_save_failed');
  }
}

export async function PATCH(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const input = updateSchema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_annotation', 120, 60);
    const update: { color?: string; note?: string | null } = {};
    if (input.color !== undefined) update.color = input.color;
    if (input.note !== undefined) update.note = input.note?.trim() || null;
    const { data, error } = await supabase.from('question_annotations').update(update).eq('id', input.id).eq('user_id', user.id).select('id,question_id,segment_key,quote,prefix,suffix,start_offset,end_offset,color,note,anchor_version').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'annotation_not_found' }, { status: 404 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'annotation_update_failed');
  }
}

export async function DELETE(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  try {
    const input = deleteSchema.parse(await readJson(request));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await enforceRateLimit(supabase, 'qbank_annotation', 120, 60);
    const { error, count } = await supabase.from('question_annotations').delete({ count: 'exact' }).eq('id', input.id).eq('user_id', user.id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: 'annotation_not_found' }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error, 'annotation_delete_failed');
  }
}
