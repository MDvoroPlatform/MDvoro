import Link from 'next/link';
import { requireStaff } from '@/lib/server/authorization';
import { Icon } from '@/components/ui/icons';
import { DashboardWidgets } from '@/components/admin/dashboard-widgets';
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
    const { supabase, user, role } = await requireStaff();
    const canManageUsers = role === 'admin' || role === 'super_admin';
    const [{ data: counts, error: countsError }, { data: recent, error: recentError }, { data: ops, error: opsError }, { data: auditEvents }] = await Promise.all([
        supabase.rpc('admin_content_counts'),
        supabase.rpc('admin_list_questions', { p_limit: 100, p_offset: 0 }),
        supabase.rpc('admin_platform_metrics'),
        canManageUsers ? supabase.rpc('admin_audit_feed', { p_limit: 6 }) : Promise.resolve({ data: [] }),
    ]);
    const c = (counts?.[0] ?? {}) as Partial<Counts>;
    const metrics = (ops ?? {}) as Record<string, unknown>;
    const dashboardQuestions = (recent ?? []) as unknown as Array<{ id: string; subject: string; topic: string | null; updated_at: string }>;
    const recentQuestions = dashboardQuestions.slice(0, 8);
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Staff';
    const hour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jerusalem' }).format(new Date()));
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const dashboardHasErrors = Boolean(countsError || recentError || opsError);
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Secure content operations</div><h1>{greeting}, {displayName}</h1><p className="subtitle">Here’s what’s happening across your platform today.</p></div><Link className="btn btn-primary" href="/admin/questions/new"><Icon name="plus" size={15}/> New question</Link></div>
    {dashboardHasErrors && <div className="admin-data-warning" role="status"><Icon name="shield" size={17}/><span>Some live dashboard data could not be loaded. Affected values are shown as unavailable instead of being reported as zero.</span></div>}
    <div className="grid grid-4 admin-metrics">
      <div className="card card-pad"><div className="metric-label">Total questions</div><div className="metric-value">{countsError ? '—' : c.total_questions ?? 0}</div><div className="metric-note">All content records</div></div>
      <div className="card card-pad"><div className="metric-label">Published</div><div className="metric-value">{countsError ? '—' : c.published_questions ?? 0}</div><div className="metric-note">Available to learners</div></div>
      <div className="card card-pad"><div className="metric-label">Drafts</div><div className="metric-value">{countsError ? '—' : c.draft_questions ?? 0}</div><div className="metric-note">Saved, not published</div></div>
      <div className="card card-pad"><div className="metric-label">Registered users</div><div className="metric-value">{opsError ? '—' : Number(metrics.total_users ?? 0)}</div><div className="metric-note">All platform accounts</div></div>
    </div>
    <div className="grid grid-3 admin-operations-metrics">
      <div className="card card-pad"><div className="metric-label">Needs review</div><div className="metric-value">{countsError ? '—' : c.in_review_questions ?? 0}</div><div className="metric-note">Waiting in the review queue</div></div>
      <div className="card card-pad"><div className="metric-label">Online now</div><div className="metric-value">{opsError ? '—' : Number(metrics.online_users ?? 0)}</div><div className="metric-note">Seen in the last five minutes</div></div>
      <div className="card card-pad"><div className="metric-label">Media assets</div><div className="metric-value">{countsError ? '—' : c.media_assets ?? 0}</div><div className="metric-note">Reusable library records</div></div>
    </div>
    <section className="card card-pad admin-section-gap">
      <div className="panel-head"><div><div className="panel-title">Content pipeline</div><div className="panel-sub">Drafts → review queue or direct admin publish → published</div></div><Link className="muted-link" href="/admin/questions">Open questions</Link></div>
      <div className="pipeline"><div><strong>{c.draft_questions ?? 0}</strong><span>Drafts</span></div><div><strong>{c.in_review_questions ?? 0}</strong><span>In medical review</span></div><div><strong>{c.published_questions ?? 0}</strong><span>Published</span></div></div>
    </section>
    <DashboardWidgets questions={dashboardQuestions}/>
    <div className="grid grid-main admin-dashboard-lower admin-section-gap">
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">Recent questions</div><div className="panel-sub">Latest records from the question bank.</div></div><Link className="muted-link" href="/admin/questions">View all</Link></div><div className="admin-mini-list">{recentQuestions.length ? recentQuestions.map((q) => <Link key={q.id} href={`/admin/questions/${q.id}`}><span><b>{q.subject || 'Untitled question'}</b><small>{q.topic || 'General'} · {q.id.slice(0, 8)}</small></span><Icon name="arrow" size={15}/></Link>) : <div className="empty-panel"><b>No questions yet</b><span>Create your first question to populate this list.</span></div>}</div></section>
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">Quick actions</div><div className="panel-sub">Shortcuts to real administration tools.</div></div></div><div className="admin-quick-actions"><Link href="/admin/questions/new"><Icon name="plus" size={17}/>Add new question<Icon name="arrow" size={15}/></Link><Link href="/admin/taxonomy"><Icon name="grid" size={17}/>Manage categories<Icon name="arrow" size={15}/></Link><Link href="/admin/questions"><Icon name="book" size={17}/>View all questions<Icon name="arrow" size={15}/></Link>{canManageUsers && <><Link href="/admin/users"><Icon name="shield" size={17}/>Manage users<Icon name="arrow" size={15}/></Link><Link href="/admin/system"><Icon name="settings" size={17}/>System settings<Icon name="arrow" size={15}/></Link></>}</div></section>
    </div>
    {canManageUsers && <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">Recent security and content activity</div><div className="panel-sub">Latest audit events available to your administrator account.</div></div><Link className="muted-link" href="/admin/audit">Open audit log</Link></div><div className="admin-mini-list">{auditEvents?.length ? (auditEvents as Array<{id:number;action:string;entity_type:string;entity_id:string;created_at:string}>).map((event)=><div key={event.id}><span><b>{event.action.replaceAll('_',' ')}</b><small>{event.entity_type} · {event.entity_id.slice(0,8)}</small></span><small>{new Date(event.created_at).toLocaleString('en',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jerusalem'})}</small></div>) : <div className="empty-panel"><b>No recent activity</b><span>New administrator and content actions will appear here.</span></div>}</div></section>}
    <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">Architecture rules</div><div className="panel-sub">The product stays easy to change because the contracts stay explicit.</div></div><Icon name="shield" size={20}/></div><div className="rule-grid"><div><b>Reusable media</b><span>One ECG/image can be attached to unlimited questions.</span></div><div><b>Versioned questions</b><span>Edits create a new version instead of destroying history.</span></div><div><b>Server-side answers</b><span>Correct answers never travel with the student question payload.</span></div><div><b>Capability-based access</b><span>Permissions are centralized instead of scattered through UI code.</span></div></div></section>
  </div>;
}

