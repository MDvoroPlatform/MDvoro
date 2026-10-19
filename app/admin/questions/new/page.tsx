import { redirect } from 'next/navigation';
import { requireContentEditor } from '@/lib/server/authorization';
import { QuestionForm } from '@/components/admin/question-form';
export default async function NewQuestionPage() {
    const context = await requireContentEditor();
    const { supabase } = context;
    const [{ data: exams }, { data: media }] = await Promise.all([
        supabase.from('exams').select('id,code,name').order('name'),
        supabase.rpc('admin_search_media', { p_search: null, p_kind: null, p_limit: 200, p_offset: 0 }),
    ]);
    if (!exams?.length)
        redirect('/admin');
    const isAdmin = context.role === 'admin' || context.role === 'super_admin';
    return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Create content</div><h1>New question</h1><p className="subtitle">{isAdmin ? 'Save as a draft or publish directly. Independent medical review is not required for administrators.' : 'Create a draft and submit it to the medical review queue.'}</p></div></div><QuestionForm exams={exams} media={media ?? []} canPublishDirect={isAdmin}/></div>;
}

