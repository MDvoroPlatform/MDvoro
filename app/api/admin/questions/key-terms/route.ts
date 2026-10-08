import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson } from '@/lib/server/api';
const schema=z.object({questionId:z.string().uuid(),terms:z.array(z.string().trim().max(80)).max(3)});
export async function POST(request:Request){const blocked=assertMutationRequest(request);if(blocked)return blocked;try{const {supabase}=await requireContentEditor();const p=schema.parse(await readJson(request));const {error}=await supabase.rpc('set_question_key_terms',{p_question_id:p.questionId,p_terms:p.terms});if(error)return NextResponse.json({error:'key_terms_failed'},{status:400});return NextResponse.json({ok:true});}catch(error){return apiError(error,'key_terms_failed');}}
