import Link from 'next/link';
import { requireStaff } from '@/lib/server/authorization';
import { Icon } from '@/components/ui/icons';
type QuestionRow = {
    id: string;
    content_code: string | null;
    stem: string;
    subject: string;
    topic: string | null;
    workflow_status: string;
    version_count: number;
    updated_at: string;
};
export default async function AdminQuestionsPage({ searchParams }: {
    searchParams: Promise<{
        q?: string;
        status?: string;
    }>;
}) {
    const { role, supabase } = await requireStaff();
    if (role === 'support')
        return <div className="admin-page"><section className="card card-pad"><h1>Read-only access</h1><p className="subtitle">Support can view Content Studio overview but cannot edit or publish medical content.</p></section></div>;
    const params = await searchParams;
    const { data: questions, error } = await supabase.rpc('admin_search_questions', { p_search: params.q ?? null, p_status: params.status ?? null, p_exam_id: null, p_limit: 100, p_offset: 0 });
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Question bank</div><h1>Questions</h1><p className="subtitle">Search, edit, review and duplicate content without touching database tables directly.</p></div><Link className="btn btn-primary" href="/admin/questions/new"><Icon name="plus" size={15}/> New question</Link></div>
    <section className="card card-pad admin-filters"><form className="admin-filter-form"><input name="q" defaultValue={params.q ?? ''} placeholder="Search code, stem, subject or topic…"/><select name="status" defaultValue={params.status ?? ''}><option value="">All statuses</option><option value="draft">Draft</option><option value="in_review">In review</option><option value="published">Published</option><option value="archived">Archived</option></select><button className="btn btn-primary" type="submit">Search</button>{(params.q || params.status) && <Link className="btn" href="/admin/questions">Clear</Link>}</form></section>
    <section className="card admin-table-wrap">{error ? <div className="empty"><h2>Could not load questions</h2><p>Check the Content Studio database migration and authorization configuration.</p></div> : questions?.length ? <table className="admin-table"><thead><tr><th>Question</th><th>Subject</th><th>Topic</th><th>Status</th><th>Versions</th><th>Updated</th></tr></thead><tbody>{(questions as QuestionRow[]).map((q) => <tr key={q.id}><td><Link href={`/admin/questions/${q.id}`} className="table-title">{q.content_code} · {q.stem.slice(0, 88)}{q.stem.length > 88 ? '…' : ''}</Link><small>{q.id}</small></td><td>{q.subject}</td><td>{q.topic || '—'}</td><td><span className={`status status-${q.workflow_status}`}>{q.workflow_status.replace('_', ' ')}</span></td><td>{q.version_count}</td><td>{new Date(q.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table> : <div className="empty"><div className="empty-icon"><Icon name="book"/></div><h2>No questions match</h2><p>Create a question or clear the filters.</p><Link className="btn btn-primary" href="/admin/questions/new">Create question</Link></div>}</section>
  </div>;
}

