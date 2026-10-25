import Link from 'next/link';
import { requireContentReviewer } from '@/lib/server/authorization';
import { QBankIssueReportControls } from '@/components/admin/qbank-issue-report-controls';

type Report = {
  id: string;
  question_id: string;
  content_code: string | null;
  subject: string;
  topic: string | null;
  stem: string;
  category: string;
  message: string;
  status: string;
  reported_at: string;
  resolution_note: string | null;
};

export default async function QBankReportsPage() {
  const { supabase } = await requireContentReviewer();
  const { data, error } = await supabase.rpc('admin_list_qbank_question_reports', { p_status: 'open', p_limit: 100 });
  const reports = (data ?? []) as Report[];
  return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Learner feedback</div><h1>Question reports</h1><p className="subtitle">Review reported answer problems, typos, unclear wording, and outdated content. Status changes are recorded in the audit log.</p></div></div>
    {error ? <section className="card card-pad"><p className="form-message error">Could not load question reports.</p></section> : reports.length ? <div className="qbank-report-grid">{reports.map((report) => <article className="card card-pad qbank-report-card" key={report.id}>
      <div className="panel-head"><div><div className="eyebrow">{report.category.replaceAll('_', ' ')} · {report.status.replaceAll('_', ' ')}</div><h2><Link href={`/admin/questions/${report.question_id}`}>{report.content_code ?? report.question_id}</Link></h2><div className="panel-sub">{report.subject}{report.topic ? ` · ${report.topic}` : ''} · {new Date(report.reported_at).toLocaleString()}</div></div></div>
      <p className="qbank-report-question">{report.stem}</p>
      {report.message && <div className="qbank-report-message"><strong>Learner report</strong><p>{report.message}</p></div>}
      <QBankIssueReportControls reportId={report.id} initialStatus={report.status} initialNote={report.resolution_note}/>
    </article>)}</div> : <section className="card card-pad"><div className="empty"><h2>Queue is clear</h2><p>There are no open learner reports.</p></div></section>}
  </div>;
}
