import Link from 'next/link';
import { requireStaff } from '@/lib/server/authorization';
import { Icon } from '@/components/ui/icons';
type Counts = {
    total_questions: number;
    draft_questions: number;
    in_review_questions: number;
    published_questions: number;
    archived_questions: number;
    media_assets: number;
    review_events: number;
};
export default async function AdminOverview() {
    const { supabase } = await requireStaff();
    const [{ data: counts }, { data: recent }, { data: ops }] = await Promise.all([
        supabase.rpc('admin_content_counts'),
        supabase.rpc('admin_list_questions', { p_limit: 8, p_offset: 0 }),
        supabase.rpc('admin_platform_metrics'),
    ]);
    const c = (counts?.[0] ?? {}) as Partial<Counts>;
    const metrics = (ops ?? {}) as Record<string, unknown>;
    const recentQuestions = (recent ?? []) as unknown as Array<{ id: string; subject: string; topic: string | null }>;
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Secure content operations</div><h1>Content Studio</h1><p className="subtitle">One simple workspace for authoring, media, review and publication.</p></div><Link className="btn btn-primary" href="/admin/questions/new"><Icon name="plus" size={15}/> New question</Link></div>
    <div className="grid grid-4 admin-metrics">
      <div className="card card-pad"><div className="metric-label">Online users</div><div className="metric-value">{Number(metrics.online_users ?? 0)}</div><div className="metric-note">Seen in the last 5 minutes</div></div>
      <div className="card card-pad"><div className="metric-label">This month revenue</div><div className="metric-value">{String(metrics.month_currency ?? '—') === 'MULTI' ? Object.entries((metrics.month_revenue_by_currency as Record<string,number>|undefined) ?? {}).map(([currency,value]) => `${currency} ${(Number(value)/100).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}`).join(' · ') : `${(Number(metrics.month_revenue_minor ?? 0)/100).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})} ${String(metrics.month_currency ?? '—')}`}</div><div className="metric-note">Current month · currencies remain separated</div></div>
      <div className="card card-pad"><div className="metric-label">Active subscribers</div><div className="metric-value">{Number(metrics.active_subscribers ?? 0)}</div><div className="metric-note">Current entitlement</div></div>
      <div className="card card-pad"><div className="metric-label">Active users · 24h</div><div className="metric-value">{Number(metrics.active_users_24h ?? 0)}</div><div className="metric-note">Verified learning activity</div></div>
    </div>
    <div className="grid grid-4 admin-metrics admin-secondary-metrics">
      <div className="card card-pad"><div className="metric-label">Total questions</div><div className="metric-value">{c.total_questions ?? 0}</div><div className="metric-note">All content records</div></div>
      <div className="card card-pad"><div className="metric-label">Needs review</div><div className="metric-value">{c.in_review_questions ?? 0}</div><div className="metric-note">Waiting for medical approval</div></div>
      <div className="card card-pad"><div className="metric-label">Published</div><div className="metric-value">{c.published_questions ?? 0}</div><div className="metric-note">Available to learners</div></div>
      <div className="card card-pad"><div className="metric-label">Media assets</div><div className="metric-value">{c.media_assets ?? 0}</div><div className="metric-note">Reusable clinical media</div></div>
    </div>
    <section className="card card-pad admin-section-gap">
      <div className="panel-head"><div><div className="panel-title">Content pipeline</div><div className="panel-sub">Draft → medical review → published</div></div><Link className="muted-link" href="/admin/questions">Open questions</Link></div>
      <div className="pipeline"><div><strong>{c.draft_questions ?? 0}</strong><span>Drafts</span></div><div><strong>{c.in_review_questions ?? 0}</strong><span>In medical review</span></div><div><strong>{c.published_questions ?? 0}</strong><span>Published</span></div></div>
    </section>
    <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">Latest content</div><div className="panel-sub">Stable content codes make support and future AI edits safer.</div></div><Link className="muted-link" href="/admin/questions">View all</Link></div><div className="admin-mini-list">{recentQuestions.map((q) => <Link key={q.id} href={`/admin/questions/${q.id}`}><span><b>{q.id}</b><small>{q.subject} · {q.topic || 'General'}</small></span><Icon name="arrow" size={15}/></Link>)}</div></section>
    <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">Architecture rules</div><div className="panel-sub">The product stays easy to change because the contracts stay explicit.</div></div><Icon name="shield" size={20}/></div><div className="rule-grid"><div><b>Reusable media</b><span>One ECG/image can be attached to unlimited questions.</span></div><div><b>Versioned questions</b><span>Edits create a new version instead of destroying history.</span></div><div><b>Server-side answers</b><span>Correct answers never travel with the student question payload.</span></div><div><b>Capability-based access</b><span>Permissions are centralized instead of scattered through UI code.</span></div></div></section>
  </div>;
}

