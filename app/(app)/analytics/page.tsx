import { createClient } from '@/lib/supabase/server';
import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { getI18n } from '@/lib/i18n/server';
type Topic = {
    topic: string;
    attempts: number;
    correct: number;
    accuracy: number;
};
type Mastery = {
    node_id: string;
    node_name: string;
    node_type: string;
    attempts: number;
    correct: number;
    accuracy: number;
    due_cards: number;
    last_attempt_at: string | null;
};
type NextAction = {
    action_type: string;
    node_id: string | null;
    node_name: string | null;
    question_id: string | null;
    reason: string;
};
type HeatmapRow = { subject: string; attempts: number; correct: number; accuracy: number };
type LearningDashboard = {
    attempts_total: number;
    correct_total: number;
    accuracy_percent: number;
    answered_today: number;
    flashcards_total: number;
    flashcards_due: number;
    weak_topics: Topic[];
};
export default async function AnalyticsPage() {
    const { messages: m, locale } = await getI18n();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return null;
    const [{ data, error }, { data: mastery }, { data: nextAction }, { data: profile }, { data: heatmap }] = await Promise.all([supabase.rpc('learning_dashboard'), supabase.rpc('learning_mastery'), supabase.rpc('learning_next_action'), supabase.from('profiles').select('active_exam_id').eq('id', user.id).maybeSingle(), supabase.rpc('learning_subject_heatmap')]);
    const { data: readinessRaw } = profile?.active_exam_id ? await supabase.rpc('learning_readiness', { p_exam_id: profile.active_exam_id }) : { data: null };
    const readiness = (readinessRaw ?? null) as { readiness_score?:number; accuracy?:number; coverage?:number; attempts_7d?:number; due_cards?:number; confidence_gap?:number|null; peer_percentile?:number|null } | null;
    const readinessCopy = ({
      en: { title: 'Readiness profile', sub: 'A transparent learning-health view, not an official exam score.', readiness: 'Readiness', coverage: 'Coverage', activity: '7-day activity', due: 'Cards due', confidence: 'Confidence gap', peers: 'Peer standing', heatmap: 'Branch heatmap', heatmapSub: 'Your accuracy and volume by branch.' },
      he: { title: 'פרופיל מוכנות', sub: 'מדד שקוף לבריאות הלמידה — לא ציון רשמי בבחינה.', readiness: 'מוכנות', coverage: 'כיסוי', activity: 'פעילות ב-7 ימים', due: 'כרטיסיות לתרגול', confidence: 'פער ביטחון', peers: 'מיקום מול עמיתים', heatmap: 'מפת חום לפי ענף', heatmapSub: 'הדיוק והיקף התרגול שלך בכל ענף.' },
      ar: { title: 'ملف الجاهزية', sub: 'مؤشر شفاف لصحة التعلم، وليس نتيجة رسمية للامتحان.', readiness: 'الجاهزية', coverage: 'التغطية', activity: 'نشاط آخر 7 أيام', due: 'بطاقات مستحقة', confidence: 'فجوة الثقة', peers: 'المقارنة مع الزملاء', heatmap: 'خريطة الفروع', heatmapSub: 'دقتك وحجم التدريب في كل فرع.' },
      ru: { title: 'Профиль готовности', sub: 'Прозрачный индикатор процесса обучения, а не официальный балл экзамена.', readiness: 'Готовность', coverage: 'Охват', activity: 'Активность за 7 дней', due: 'Карточки к повторению', confidence: 'Разрыв уверенности', peers: 'Сравнение с коллегами', heatmap: 'Тепловая карта дисциплин', heatmapSub: 'Точность и объём практики по каждой дисциплине.' },
    } as const)[locale];
    const dashboard = data?.[0] as LearningDashboard | undefined;
    const masteryRows = (mastery ?? []) as Mastery[];
    const heatmapRows = (heatmap ?? []) as HeatmapRow[];
    const action = (nextAction?.[0] ?? null) as NextAction | null;
    const head = <div className="page-head"><div><div className="eyebrow">{m.analytics.eyebrow}</div><h1>{m.analytics.title}</h1><p className="subtitle">{m.analytics.subtitle}</p></div></div>;
    if (error || !dashboard)
        return <div className="page">{head}<section className="card"><EmptyPanel title={m.common.noResults} description={m.analytics.notEnoughDesc} action={m.common.back} href="/dashboard"/></section></div>;
    return <div className="page">{head}<section className="card card-pad readiness-panel"><div className="panel-head"><div><div className="panel-title">{readinessCopy.title}</div><div className="panel-sub">{readinessCopy.sub}</div></div><div className="readiness-score">{readiness?.readiness_score != null ? Math.round(readiness.readiness_score) : '—'}<small>/100</small></div></div><div className="readiness-grid"><div><span>{readinessCopy.readiness}</span><b>{readiness?.readiness_score != null ? `${Math.round(readiness.readiness_score)}/100` : '—'}</b></div><div><span>{readinessCopy.coverage}</span><b>{readiness?.coverage != null ? `${Math.round(readiness.coverage)}%` : '—'}</b></div><div><span>{readinessCopy.activity}</span><b>{readiness?.attempts_7d ?? 0}</b></div><div><span>{readinessCopy.due}</span><b>{readiness?.due_cards ?? 0}</b></div><div><span>{readinessCopy.confidence}</span><b>{readiness?.confidence_gap == null ? '—' : `${readiness.confidence_gap > 0 ? '+' : ''}${readiness.confidence_gap}%`}</b></div><div><span>{readinessCopy.peers}</span><b>{readiness?.peer_percentile != null ? `P${Math.round(readiness.peer_percentile)}` : '—'}</b></div></div></section><div className="grid grid-4"><div className="card card-pad"><div className="metric-label">{m.analytics.answered}</div><div className="metric-value">{dashboard.attempts_total}</div><div className="metric-note">{dashboard.answered_today} {m.analytics.today}</div></div><div className="card card-pad"><div className="metric-label">{m.analytics.accuracy}</div><div className="metric-value">{dashboard.accuracy_percent}%</div><div className="metric-note">{m.analytics.verifiedAttempts}</div></div><div className="card card-pad"><div className="metric-label">{m.analytics.flashcards}</div><div className="metric-value">{dashboard.flashcards_total}</div><div className="metric-note">{dashboard.flashcards_due} {m.analytics.dueNow}</div></div><div className="card card-pad"><div className="metric-label">{m.analytics.correct}</div><div className="metric-value">{dashboard.correct_total}</div><div className="metric-note">{m.analytics.recordedServer}</div></div></div>
 <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">{readinessCopy.heatmap}</div><div className="panel-sub">{readinessCopy.heatmapSub}</div></div></div>{heatmapRows.length ? <div className="subject-heatmap">{heatmapRows.map(row => <div className={`heatmap-cell ${row.accuracy >= 80 ? 'strong' : row.accuracy >= 65 ? 'mid' : 'weak'}`} key={row.subject}><div><b>{row.subject}</b><small>{row.attempts} Q · {row.correct} correct</small></div><strong>{row.accuracy}%</strong></div>)}</div> : <p className="panel-sub">{m.analytics.notEnoughDesc}</p>}</section>
 <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">{m.analytics.weakest}</div><div className="panel-sub">{m.analytics.weakestSub}</div></div></div>{dashboard.weak_topics.length ? <div className="admin-table">{dashboard.weak_topics.map(topic => <div className="admin-row" key={topic.topic}><div><b>{topic.topic}</b><small>{topic.correct}/{topic.attempts} correct</small></div><span>{topic.accuracy}%</span></div>)}</div> : <EmptyPanel title={m.analytics.notEnough} description={m.analytics.notEnoughDesc} action={m.common.start} href="/qbank"/>}</section>
 <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">{m.analytics.mastery}</div><div className="panel-sub">{m.analytics.masterySub}</div></div></div>{masteryRows.length ? <div className="admin-table">{masteryRows.map(row => <div className="admin-row" key={row.node_id}><div><b>{row.node_name}</b><small>{row.node_type} · {row.correct}/{row.attempts} correct{row.due_cards ? ` · ${row.due_cards} card${row.due_cards === 1 ? '' : 's'} due` : ''}</small></div><span>{row.accuracy}%</span></div>)}</div> : <p className="panel-sub">{m.analytics.notEnoughDesc}</p>}</section>
 <section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">{m.analytics.next}</div><div className="panel-sub">{m.analytics.nextSub}</div></div></div>{action ? <div className="learning-next-action"><div><strong>{action.action_type === 'flashcard' ? m.analytics.reviewNow : action.node_name ? `${m.common.practice} ${action.node_name}` : m.dashboard.qbank}</strong><span>{action.reason}</span></div>{action.action_type === 'qbank' && action.question_id ? <a className="btn btn-primary" href={`/qbank?question=${action.question_id}`}>{m.analytics.practiceNow}</a> : <a className="btn btn-primary" href="/flashcards">{m.analytics.reviewNow}</a>}</div> : null}</section>
 </div>;
}

