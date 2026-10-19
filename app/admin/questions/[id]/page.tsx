import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/server/authorization';
import { QuestionForm } from '@/components/admin/question-form';
export default async function EditQuestionPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { id } = await params;
    const context = await requireStaff();
    if (context.role === 'support')
        return <div className="admin-page"><section className="card card-pad"><h1>Read-only access</h1><p className="subtitle">Support cannot open private editorial question data.</p></section></div>;
    const [{ data: question }, { data: exams }, { data: media }, { data: taxonomy }, { data: selectedTaxonomy }] = await Promise.all([
        context.supabase.rpc('admin_get_question', { p_question_id: id }),
        context.supabase.from('exams').select('id,code,name').order('name'),
        context.supabase.rpc('admin_search_media', { p_search: null, p_kind: null, p_limit: 200, p_offset: 0 }),
        context.supabase.rpc('admin_taxonomy_tree', { p_parent_id: null }),
        context.supabase.from('question_taxonomy').select('taxonomy_id').eq('question_id', id),
    ]);
    const q = question?.[0];
    if (!q)
        notFound();
    const isAdmin = context.role === 'admin' || context.role === 'super_admin';
    return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Question editor</div><h1>{q.content_code}</h1><p className="subtitle">{isAdmin ? 'Save changes to publish immediately without independent medical review. Every save creates a version.' : 'Save a draft, submit it for review, then publish. Every save creates a version.'}</p></div></div><QuestionForm taxonomy={taxonomy ?? []} selectedTaxonomyIds={(selectedTaxonomy ?? []).map((x) => x.taxonomy_id)} exams={exams ?? []} media={media ?? []} canReview={isAdmin || context.role === 'reviewer'} canEdit={isAdmin || context.role === 'editor'} canPublishDirect={isAdmin} initial={{ id: q.id, contentCode: q.content_code, examId: q.exam_id, stem: q.stem, subject: q.subject, topic: q.topic ?? '', options: (q.options as {
            id: string;
            text: string;
        }[]) ?? [], answerKey: q.answer_key, explanation: q.explanation ?? '', keyLearningPoint: q.key_learning_point ?? '', difficulty: q.difficulty, mediaIds: q.media_ids ?? [], workflowStatus: q.workflow_status, isReconstruction: q.is_reconstruction ?? false, reconstructionYear: q.reconstruction_year ?? null, reconstructionLabel: q.reconstruction_label ?? 'שחזור' }}/></div>;
}

