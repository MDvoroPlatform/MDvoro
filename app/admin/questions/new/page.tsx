import { redirect } from 'next/navigation';
import { requireContentEditor } from '@/lib/server/authorization';
import { QuestionForm } from '@/components/admin/question-form';
export default async function NewQuestionPage() {
    const { supabase } = await requireContentEditor();
    const [{ data: exams }, { data: media }] = await Promise.all([
        supabase.from('exams').select('id,code,name').order('name'),
        supabase.rpc('admin_search_media', { p_search: null, p_kind: null, p_limit: 200, p_offset: 0 }),
    ]);
    if (!exams?.length)
        redirect('/admin');
    return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Create content</div><h1>New question</h1><p className="subtitle">Keep the question original, attach reusable media, then send it to medical review.</p></div></div><QuestionForm exams={exams} media={media ?? []}/></div>;
}

