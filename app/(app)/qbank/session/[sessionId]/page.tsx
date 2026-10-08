import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { QBankSessionPlayer } from '@/components/qbank/qbank-session-player';
export default async function QBankSessionPage({params}:{params:Promise<{sessionId:string}>}){
 const {sessionId}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)notFound();const {data}=await supabase.rpc('get_study_session_state',{p_session_id:sessionId,p_position:0});if(!data)notFound();return <QBankSessionPlayer sessionId={sessionId}/>;
}
