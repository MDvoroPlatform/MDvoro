import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { normalizeMedicalSearchQuery } from '@/lib/search/medical-query';
import { getI18n } from '@/lib/i18n/server';

type Result = { id: string; content_code: string | null; stem: string; subject: string; topic: string | null; exam_code: string; exam_name: string };

export default async function QuestionSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ messages: m, locale }, params] = await Promise.all([getI18n(), searchParams]);
  const query = normalizeMedicalSearchQuery(params.q ?? '');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = query.length >= 4
    ? await supabase.rpc('student_search_questions', { p_query: query, p_limit: 30 })
    : { data: [] };
  const results = (data ?? []) as Result[];
  return <div className="page question-search-page">
    <div className="page-head"><div><div className="eyebrow">{m.qbank.eyebrow}</div><h1>{m.search.results}</h1><p className="subtitle">{m.search.searchingFor} “{params.q ?? ''}”</p></div><Link href="/qbank" className="btn">{m.common.back}</Link></div>
    {!results.length ? <section className="card card-pad"><h2>{m.search.noResults}</h2><p className="panel-sub">{m.search.onlyAvailable}</p></section> : <div className="question-search-list">
      {results.map(row => <article key={row.id} className="card card-pad question-search-result">
        <div><span className="status status-published">{row.content_code || row.exam_code}</span><span className="question-search-meta">{row.exam_code} · {row.subject}{row.topic ? ` · ${row.topic}` : ''}</span></div>
        <p>{row.stem}</p>
      </article>)}
    </div>}
  </div>;
}
