import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson } from '@/lib/server/api';
const schema=z.object({noticeId:z.string().uuid(),status:z.enum(['in_review','resolved','rejected']),note:z.string().max(4000).optional()});
export async function POST(request:Request){const blocked=assertMutationRequest(request);if(blocked)return blocked;try{const {supabase}=await requireAdmin();const p=schema.parse(await readJson(request));const {error}=await supabase.rpc('admin_resolve_copyright_notice',{p_notice_id:p.noticeId,p_status:p.status,p_note:p.note??null});if(error)return NextResponse.json({error:'copyright_update_failed'},{status:400});return NextResponse.json({ok:true});}catch(error){return apiError(error,'copyright_update_failed');}}
