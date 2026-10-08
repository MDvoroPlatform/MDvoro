import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
const schema=z.object({confirmation:z.literal('DELETE')});
async function removeAccount(request:Request){const blocked=assertMutationRequest(request);if(blocked)return blocked;try{const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401});await enforceRateLimit(supabase,'auth_mutation',3,3600);const {confirmation}=schema.parse(await readJson(request));const {error}=await supabase.rpc('delete_my_account',{p_confirmation:confirmation});if(error)return NextResponse.json({error:error.message.includes('confirmation_required')?'confirmation_required':'delete_failed'},{status:400});await supabase.auth.signOut();return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error,'delete_failed');}}

export { removeAccount as DELETE, removeAccount as POST };
