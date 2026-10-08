import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/server/api';
import { z } from 'zod';
export async function GET(_request:Request,{params}:{params:Promise<{sessionId:string}>}) {
  try {
    const {sessionId}=await params; z.string().uuid().parse(sessionId);
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
    if(!user)return NextResponse.json({error:'unauthorized'},{status:401});
    const {data,error}=await supabase.rpc('get_study_session_state',{p_session_id:sessionId,p_position:1});
    if(error)return NextResponse.json({error:'session_not_found'},{status:404});
    return NextResponse.json(data??null,{headers:{'Cache-Control':'private,no-store'}});
  } catch(error){return apiError(error,'session_load_failed');}
}
