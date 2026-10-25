import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getI18n } from '@/lib/i18n/server';

type StudySession = {
  id: string;
  exam_code: string;
  exam_name: string;
  mode: string;
  status: string;
  requested_count: number;
  answered_count: number;
  correct_count: number;
  score_percent: number | null;
  started_at: string;
};

export default async function QBankHistoryPage() {
  const [{ messages: m, locale }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { data } = await supabase.rpc('list_study_sessions', { p_limit: 100 });
  const rows = (data ?? []) as StudySession[];
  const statusText = (status: string) => {
    if (status === 'completed') return { en: 'Completed', ar: 'مكتمل', he: 'הושלם', ru: 'Завершено' }[locale];
    if (status === 'in_progress') return { en: 'In progress', ar: 'قيد التقدم', he: 'בתהליך', ru: 'В процессе' }[locale];
    return status.replaceAll('_', ' ');
  };
  const resumeText = { en: 'Resume session', ar: 'استئناف الجلسة', he: 'חידוש מפגש', ru: 'Продолжить сессию' }[locale];

  return (
    <div className="page qbank-history-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{m.qbank.history}</div>
          <h1>{m.qbank.historyTitle}</h1>
          <p className="subtitle">{m.qbank.historySubtitle}</p>
        </div>
        <Link className="btn btn-primary" href="/qbank">{m.qbank.newSession}</Link>
      </div>

      {rows.length > 0 ? (
        <section className="qbank-history-list" aria-label={m.qbank.historyTitle}>
          {rows.map((row) => {
            const href = (row.status === 'in_progress' ? `/qbank/session/${row.id}` : `/qbank/session/${row.id}/result`) as Route;
            const date = new Date(row.started_at);
            const accuracy = row.answered_count > 0 ? Math.round((row.correct_count / row.answered_count) * 100) : null;
            return (
              <article className="card qbank-history-card" key={row.id}>
                <div className="qbank-history-main">
                  <div className="qbank-history-title-row">
                    <Link className="qbank-history-title" href={href}>{row.exam_name || row.exam_code}</Link>
                    <span className={`status ${row.status === 'completed' ? 'status-published' : 'status-draft'}`}>{statusText(row.status)}</span>
                  </div>
                  <div className="qbank-history-meta"><span>{row.exam_code}</span><span>{row.mode === 'exam' ? m.qbank.examMode : m.qbank.practiceMode}</span><time dateTime={date.toISOString()}>{date.toLocaleString(locale)}</time></div>
                </div>
                <div className="qbank-history-stats">
                  <div><small>{m.qbank.questions}</small><strong>{row.answered_count}<span> / {row.requested_count}</span></strong></div>
                  <div><small>{m.qbank.score}</small><strong>{row.score_percent == null ? '—' : `${row.score_percent}%`}</strong>{accuracy !== null && <em>{accuracy}% {m.qbank.correctAnswers}</em>}</div>
                </div>
                <Link className="btn qbank-history-open" href={href}>{row.status === 'in_progress' ? resumeText : m.qbank.questionReview}</Link>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="card qbank-history-empty">
          <div className="empty-icon" aria-hidden="true">↗</div>
          <div className="eyebrow">{m.qbank.history}</div>
          <h2>{m.qbank.noHistory}</h2>
          <p>{m.qbank.noHistoryDesc}</p>
          <Link className="btn btn-primary" href="/qbank">{m.qbank.startSession}</Link>
        </section>
      )}
    </div>
  );
}
