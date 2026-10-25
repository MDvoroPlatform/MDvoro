import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sessionStateSchema } from '@/lib/validation/qbank';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
export async function GET(_request:Request,{params}:{params:Promise<{sessionId:string}>}){try{const {sessionId}=await params;const url=new URL(_request.url);const position=Number(url.searchParams.get('position')??'1');const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401});const {data,error}=await supabase.rpc('get_study_session_state',{p_session_id:sessionId,p_position:position});if(error){const code=error.message.includes('block_closed')?'block_closed':error.message.includes('block_not_open')?'block_not_open':error.message.includes('session_expired')?'session_expired':error.message.includes('on_break')?'on_break':'session_not_found';const status=code==='session_expired'?410:code==='session_not_found'?404:409;return NextResponse.json({error:code},{status});}
    const question=data?.question;
    if(question?.id){
      const {data:bookmark,error:bookmarkError}=await supabase.from('question_bookmarks').select('question_id').eq('user_id',user.id).eq('question_id',question.id).maybeSingle();
      if(bookmarkError) throw bookmarkError;
      question.is_saved=Boolean(bookmark);
    }
    if(question&&Array.isArray(question.media)){
        const {data:storedMedia,error:mediaError}=await supabase.rpc('get_study_session_media_paths',{p_session_id:sessionId,p_position:data.session.current_position});
        if(mediaError) throw mediaError;
        const pathsById=new Map<string,string>();
        for(const asset of (storedMedia??[]) as {id:string;storage_path:string|null}[]){if(asset.storage_path)pathsById.set(asset.id,asset.storage_path);}
        question.media=await Promise.all(question.media.map(async(asset:{id:string;external_url:string|null})=>{
            const path=pathsById.get(asset.id);
            if(!path||asset.external_url)return asset;
            const {data:signed,error:signError}=await supabase.storage.from('medical-media').createSignedUrl(path,3600);
            if(signError) throw signError;
            return {...asset,external_url:signed.signedUrl};
        }));
    }
    return NextResponse.json(data??null,{headers:{'Cache-Control':'private,no-store'}});}catch(error){return apiError(error,'session_load_failed');}}
export async function POST(request:Request,{params}:{params:Promise<{sessionId:string}>}){
 const blocked=assertMutationRequest(request);if(blocked)return blocked;
 try{const {sessionId}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401});await enforceRateLimit(supabase,'qbank_answer',120,60);const p=sessionStateSchema.parse(await readJson(request));const {error}=await supabase.rpc('set_study_session_item_state',{p_session_id:sessionId,p_position:p.position,p_marked:p.marked??null,p_note:p.note??null});if(error){const msg=error.message; const code=msg.includes('block_closed')?'block_closed':msg.includes('block_not_open')?'block_not_open':msg.includes('on_break')?'on_break':msg.includes('session_not_active')?'session_not_active':'state_update_failed'; return NextResponse.json({error:code},{status:code==='block_closed'||code==='block_not_open'||code==='on_break'?409:400});}return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error,'state_update_failed');}
}
