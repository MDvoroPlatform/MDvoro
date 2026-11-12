import { QBankSessionPlayer } from '@/components/qbank/qbank-session-player';
export default async function QBankSessionPage({params}:{params:Promise<{sessionId:string}>}){
 const {sessionId}=await params;return <QBankSessionPlayer sessionId={sessionId}/>;
}
