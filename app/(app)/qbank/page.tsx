import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { QBankConfigurator } from '@/components/qbank/qbank-configurator';
import { getI18n } from '@/lib/i18n/server';

type Exam = { id: string; code: string; name: string };

export default async function QBankPage({ searchParams }: { searchParams: Promise<{ examId?: string; pool?: string; full?: string }> }) {
  const [{ messages: m, locale }, params, supabase] = await Promise.all([getI18n(), searchParams, createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: exams }, { data: profile }] = await Promise.all([
    supabase.from('exams').select('id,code,name').order('name'),
    supabase.from('profiles').select('active_exam_id').eq('id', user.id).maybeSingle(),
  ]);
  const pools = ['mixed', 'unseen', 'incorrect', 'answered', 'unanswered', 'bookmarked'] as const;
  const initialPool = pools.includes(params.pool as typeof pools[number]) ? params.pool as typeof pools[number] : undefined;
  const labLabel = ({ en: 'Lab values', ar: 'القيم المخبرية', he: 'ערכי מעבדה', ru: 'Лабораторные показатели' } as const)[locale];

  return (
    <div className="page qbank-builder-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{m.qbank.setupKicker}</div>
          <h1>{m.qbank.setupTitle}</h1>
          <p className="subtitle">{m.qbank.setupSubtitle}</p>
        </div>
        <div className="qbank-page-actions">
          <Link className="btn" href="/qbank/labs">{labLabel}</Link>
          <Link className="btn btn-primary" href="/qbank/history">{m.qbank.history}</Link>
        </div>
      </div>
      <QBankConfigurator
        exams={(exams ?? []) as Exam[]}
        currentExamId={profile?.active_exam_id ?? null}
        initialExamId={params.examId ?? null}
        initialPool={initialPool}
        fullExam={params.full === '1'}
      />
    </div>
  );
}
