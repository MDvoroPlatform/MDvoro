import Link from 'next/link';
import { requireContentReviewer } from '@/lib/server/authorization';
type ReviewRow = {
    id: string;
    content_code: string | null;
    stem: string;
    subject: string;
    topic: string | null;
    version_count: number;
    updated_at: string;
};
export default async function ReviewQueuePage() {
    const { supabase } = await requireContentReviewer();
    const { data: questions } = await supabase.rpc('admin_search_questions', { p_search: null, p_status: 'in_review', p_exam_id: null, p_limit: 100, p_offset: 0 });
    return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Medical quality gate</div><h1>Review queue</h1><p className="subtitle">Only questions explicitly submitted for review appear here. Publishing is a deliberate reviewer action.</p></div></div><section className="card admin-table-wrap">{questions?.length ? <table className="admin-table"><thead><tr><th>Question</th><th>Subject</th><th>Topic</th><th>Versions</th><th>Updated</th><th /></tr></thead><tbody>{(questions as ReviewRow[]).map((q) => <tr key={q.id}><td><Link href={`/admin/questions/${q.id}`} className="table-title">{q.content_code}</Link><small>{q.stem.slice(0, 110)}{q.stem.length > 110 ? '…' : ''}</small></td><td>{q.subject}</td><td>{q.topic || '—'}</td><td>{q.version_count}</td><td>{new Date(q.updated_at).toLocaleDateString()}</td><td><Link className="btn btn-primary" href={`/admin/questions/${q.id}`}>Review</Link></td></tr>)}</tbody></table> : <div className="empty"><h2>Queue is clear</h2><p>There are no questions waiting for medical review.</p></div>}</section></div>;
}

