import { requireContentEditor } from '@/lib/server/authorization';
import { KnowledgeStudio } from '@/components/admin/knowledge-studio';
export default async function KnowledgePage() { const { supabase } = await requireContentEditor(); const { data } = await supabase.from('knowledge_cards').select('id,stable_code,title,summary,status,updated_at').order('updated_at', { ascending: false }).limit(100); return <KnowledgeStudio initialCards={data ?? []}/>; }

