import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { Icon } from '@/components/ui/icons';
import { getI18n } from '@/lib/i18n/server';
import { SmartMentor } from '@/components/dashboard/smart-mentor';
import { BoardCommandCenter, type BoardSnapshot, type BlueprintRow, type ActivityRow, type Mistakes } from '@/components/dashboard/board-command-center';
import type { SmartSnapshot } from '@/lib/learning/rules';
export default async function DashboardPage() {
    const { messages: m, locale } = await getI18n();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return null;
    const [{ data: profile }, { data: smart }] = await Promise.all([
        supabase.from('profiles').select('active_exam_id').eq('id', user.id).maybeSingle(),
        supabase.rpc('smart_student_snapshot')
    ]);
    const snapshot = (smart ?? null) as SmartSnapshot | null;
    const [{ data: readinessRaw }, { data: blueprintRaw }, { data: activityRaw }, { data: mistakesRaw }, { data: activeExam }] = await Promise.all([
      profile?.active_exam_id ? supabase.rpc('learning_readiness', { p_exam_id: profile.active_exam_id }) : Promise.resolve({ data: null }),
      profile?.active_exam_id ? supabase.rpc('learning_exam_blueprint', { p_exam_id: profile.active_exam_id }) : Promise.resolve({ data: [] }),
      supabase.rpc('learning_daily_activity', { p_days: 14 }),
      profile?.active_exam_id ? supabase.rpc('learning_mistake_profile', { p_exam_id: profile.active_exam_id }) : Promise.resolve({ data: null }),
      profile?.active_exam_id ? supabase.from('exams').select('id,code,name,official_max_items,product_max_items').eq('id', profile.active_exam_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const readiness = (readinessRaw ?? null) as { readiness_score?:number; accuracy?:number; coverage?:number; attempts_7d?:number; due_cards?:number; confidence_gap?:number|null; peer_percentile?:number|null; peer_participants?:number } | null;
    const hasExam = Boolean(profile?.active_exam_id);
    const competitiveCopy = ({
      en: { readiness: 'Readiness index', readinessNote: 'Transparent learning-health signal, not an official exam score.', weekly: 'Weekly challenge', weeklyNote: 'Questions this week toward a focused minimum.', confidence: 'Confidence calibration', confidenceNote: 'High-confidence accuracy minus low-confidence accuracy.', peers: 'Peer standing', peersNote: 'Shown only when the privacy threshold is met.', notebook: 'My Notebook', notebookNote: 'Keep every private QBank note searchable in one place.' },
      he: { readiness: 'מדד מוכנות', readinessNote: 'מדד שקוף לבריאות הלמידה — לא ציון רשמי בבחינה.', weekly: 'אתגר שבועי', weeklyNote: 'שאלות השבוע בדרך ליעד ממוקד.', confidence: 'כיול ביטחון', confidenceNote: 'דיוק בתשובות עם ביטחון גבוה פחות דיוק בביטחון נמוך.', peers: 'מיקום מול עמיתים', peersNote: 'מוצג רק כאשר סף הפרטיות מתקיים.', notebook: 'המחברת שלי', notebookNote: 'כל ההערות הפרטיות שלך במקום אחד, עם חיפוש.' },
      ar: { readiness: 'مؤشر الجاهزية', readinessNote: 'مؤشر شفاف لصحة التعلم، وليس نتيجة رسمية للامتحان.', weekly: 'التحدي الأسبوعي', weeklyNote: 'أسئلة هذا الأسبوع نحو هدف مركز.', confidence: 'معايرة الثقة', confidenceNote: 'دقة الإجابات ذات الثقة العالية ناقص دقة الثقة المنخفضة.', peers: 'مقارنة الزملاء', peersNote: 'يظهر فقط عند استيفاء حد الخصوصية.', notebook: 'مذكرتي', notebookNote: 'احتفظ بكل ملاحظاتك الخاصة مع بحث سريع.' },
      ru: { readiness: 'Индекс готовности', readinessNote: 'Прозрачный показатель обучения, а не официальный балл экзамена.', weekly: 'Недельный вызов', weeklyNote: 'Вопросы этой недели к целевому минимуму.', confidence: 'Калибровка уверенности', confidenceNote: 'Точность при высокой уверенности минус точность при низкой.', peers: 'Сравнение с коллегами', peersNote: 'Показывается только при соблюдении порога приватности.', notebook: 'Мой блокнот', notebookNote: 'Все личные заметки QBank доступны в одном поиске.' },
    } as const)[locale];
    return <div className="page">
  <section className="dashboard-welcome card">
    <div className="dashboard-welcome-copy">
      <div className="eyebrow">{m.dashboard.eyebrow}</div>
      <h1>{m.dashboard.title}</h1>
      <p className="subtitle">{m.dashboard.subtitle}</p>
      <div className="dashboard-welcome-meta"><span><Icon name="book" size={13}/>{hasExam ? (activeExam?.code ?? m.settings.activeExam) : m.shell.chooseExam}</span><span><Icon name="shield" size={13}/>{m.shell.secure}</span></div>
    </div>
    <div className="dashboard-welcome-action"><Link className="btn btn-primary" href="/qbank"><Icon name="plus" size={15}/>{m.common.start} {m.dashboard.qbank}</Link><Link className="dashboard-secondary-link" href="/study-plan">{m.dashboard.plan}</Link></div>
  </section>
  <div className="grid grid-4 dashboard-metrics">
    <section className="card metric premium-metric"><span className="metric-label">{competitiveCopy.readiness}</span><strong className="metric-value">{readiness?.readiness_score != null ? `${Math.round(readiness.readiness_score)}/100` : '—'}</strong><span className="metric-note">{competitiveCopy.readinessNote}</span></section>
    <section className="card metric premium-metric"><span className="metric-label">{m.dashboard.today}</span><strong className="metric-value">{snapshot?.today?.attempts_today ?? 0}<small>/{snapshot?.plan?.daily_questions ?? 40}</small></strong><span className="metric-note">{m.dashboard.target}</span></section>
    <section className="card metric premium-metric"><span className="metric-label">{m.flashcards.dueNow}</span><strong className="metric-value">{snapshot?.due_cards ?? 0}</strong><span className="metric-note">{m.flashcards.waiting}</span></section>
    <section className="card metric premium-metric"><span className="metric-label">{m.dashboard.streak}</span><strong className="metric-value">{snapshot?.streak_days ?? 0}<small> {m.dashboard.days}</small></strong><span className="metric-note">{m.dashboard.activitySub}</span></section>
  </div>
  <BoardCommandCenter locale={locale} snapshot={(snapshot as BoardSnapshot | null)} blueprint={(blueprintRaw ?? []) as BlueprintRow[]} activity={(activityRaw ?? []) as ActivityRow[]} mistakes={(mistakesRaw ?? null) as Mistakes | null} examId={profile?.active_exam_id ?? null} fullExamCap={(activeExam?.official_max_items ?? activeExam?.product_max_items ?? null) as number | null}/>
  <SmartMentor snapshot={snapshot}/>
  <div className="grid grid-4 dashboard-competitive"><section className="card card-pad"><span className="metric-label">{competitiveCopy.readiness}</span><strong className="metric-value">{readiness?.readiness_score != null ? `${Math.round(readiness.readiness_score)}/100` : '—'}</strong><span className="metric-note">{competitiveCopy.readinessNote}</span></section><section className="card card-pad"><span className="metric-label">{competitiveCopy.weekly}</span><strong className="metric-value">{Math.min(readiness?.attempts_7d ?? 0,40)}/40</strong><span className="metric-note">{competitiveCopy.weeklyNote}</span></section><section className="card card-pad"><span className="metric-label">{competitiveCopy.confidence}</span><strong className="metric-value">{readiness?.confidence_gap == null ? '—' : `${readiness.confidence_gap > 0 ? '+' : ''}${readiness.confidence_gap}%`}</strong><span className="metric-note">{competitiveCopy.confidenceNote}</span></section><section className="card card-pad"><span className="metric-label">{competitiveCopy.peers}</span><strong className="metric-value">{readiness?.peer_percentile != null ? `P${Math.round(readiness.peer_percentile)}` : '—'}</strong><span className="metric-note">{competitiveCopy.peersNote}</span></section></div>
  <div className="grid grid-main">
   <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{m.dashboard.today}</div><div className="panel-sub">{m.dashboard.todaySub}</div></div><Icon name="target" size={20}/></div>{!hasExam ? <EmptyPanel title={m.dashboard.chooseExam} description={m.dashboard.chooseExamDesc} action={m.nav.settings} href="/settings"/> : snapshot?.recommendations?.length ? <div className="today-mission">{snapshot.recommendations.slice(0, 3).map((r, i) => <div className="today-mission-row" key={`${r.type}-${i}`}><div><span className="kicker">{i === 0 ? m.qbank.next : m.common.practice}</span><strong>{r.title}</strong><small>{r.reason}</small></div><Link className="btn btn-sm" href={r.type === 'flashcards' ? '/flashcards' : '/qbank'}>{r.type === 'flashcards' ? m.common.review : m.common.practice}</Link></div>)}</div> : <EmptyPanel title={m.dashboard.buildSignal} description={m.dashboard.buildSignalDesc} action={m.common.start} href="/qbank"/>}</section>
   <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{m.dashboard.intelligence}</div><div className="panel-sub">{m.dashboard.intelligenceSub}</div></div><Icon name="brain" size={20}/></div><div className="intelligence-list">{[[m.dashboard.performance, 'performance'], [m.dashboard.retention, 'retention'], [m.dashboard.weakAreas, 'weak']].map(([x]) => <div key={x} className="intelligence-row"><span>{x}</span><span>{m.dashboard.awaiting}</span></div>)}</div><div className="intelligence-note"><strong>{m.dashboard.principle}:</strong> {m.dashboard.principleText}</div></section>
  </div>
  <div className="grid grid-3 dashboard-actions">
   <Link className="card card-pad" href="/qbank"><div className="kicker">{m.common.practice}</div><h2 className="dashboard-action-title">{m.dashboard.qbank}</h2><p className="panel-sub">{m.dashboard.qbankDesc}</p></Link>
   <Link className="card card-pad" href="/flashcards"><div className="kicker">{m.dashboard.retention}</div><h2 className="dashboard-action-title">{m.dashboard.flashcards}</h2><p className="panel-sub">{m.dashboard.flashcardsDesc}</p></Link>
   <Link className="card card-pad" href="/analytics"><div className="kicker">{m.dashboard.intelligence}</div><h2 className="dashboard-action-title">{m.dashboard.analytics}</h2><p className="panel-sub">{m.dashboard.analyticsDesc}</p></Link>
   <Link className="card card-pad" href="/notebook"><div className="kicker">MDvoro</div><h2 className="dashboard-action-title">{competitiveCopy.notebook}</h2><p className="panel-sub">{competitiveCopy.notebookNote}</p></Link>
  </div>
 </div>;
}

