import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { noStoreJson, apiError } from '@/lib/server/api';
export async function GET(){try{const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return noStoreJson({error:'unauthorized'},{status:401});const {data,error}=await supabase.rpc('list_study_sessions',{p_limit:100});if(error)return noStoreJson({error:'history_failed'},{status:400});return noStoreJson(data??[]);}catch(error){return apiError(error,'history_failed');}}
