import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
const schema=z.object({sessionId:z.string().uuid()});
export async function POST(request:Request){const blocked=assertMutationRequest(request);if(blocked)return blocked;try{const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401});await enforceRateLimit(supabase,'auth_mutation',10,60);const {sessionId}=schema.parse(await readJson(request));const {error}=await supabase.rpc('touch_presence',{p_session_id:sessionId});if(error)return NextResponse.json({error:'presence_failed'},{status:400});return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error,'presence_failed');}}
