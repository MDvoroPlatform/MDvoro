'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n/provider';
type Plan = {
    configured: boolean;
    plan?: {
        exam_id: string;
        target_date: string | null;
        daily_minutes: number;
    };
    days_remaining?: number | null;
    due_cards?: number;
    accessible_questions?: number;
    daily_question_target?: number;
    daily_flashcard_target?: number;
    weak_concepts?: {
        id: string;
        name: string;
        type: string;
        accuracy: number;
        attempts: number;
    }[];
};
type Exam = {
    id: string;
    name: string;
};
type Props = {
    exams: Exam[];
    currentExamId: string | null;
};
export function AdaptivePlan({ exams, currentExamId }: Props) { const { messages: m } = useI18n(); const [data, setData] = useState<Plan | null>(null); const [exam, setExam] = useState(currentExamId ?? exams[0]?.id ?? ''); const [date, setDate] = useState(''); const [minutes, setMinutes] = useState(90); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const load = () => fetch('/api/study-plan', { cache: 'no-store' }).then(r => r.json()).then(setData).catch(() => setData(null)); useEffect(() => { void load(); }, []); const save = async () => { setSaving(true); setMessage(''); try {
    const r = await fetch('/api/study-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examId: exam, targetDate: date || null, dailyMinutes: minutes }) });
    const b = await r.json();
    if (!r.ok) {
        setMessage(m.studyPlan.couldNotSave);
        return;
    }
    setData(b);
    setMessage(m.studyPlan.planUpdated);
}
catch {
    setMessage(m.studyPlan.couldNotSave);
}
finally {
    setSaving(false);
} }; if (data?.configured)
    return <div className="study-plan-stack"><section className="grid grid-4"><div className="card card-pad"><span className="metric-label">{m.studyPlan.days}</span><strong className="metric-value">{data.days_remaining ?? '∞'}</strong><span className="metric-note">{m.studyPlan.until}</span></div><div className="card card-pad"><span className="metric-label">{m.studyPlan.dailyQuestions}</span><strong className="metric-value">{data.daily_question_target}</strong><span className="metric-note">{m.studyPlan.adaptiveTarget}</span></div><div className="card card-pad"><span className="metric-label">{m.studyPlan.dueCards}</span><strong className="metric-value">{data.due_cards}</strong><span className="metric-note">{m.studyPlan.retrievalFirst}</span></div><div className="card card-pad"><span className="metric-label">{m.studyPlan.dailyMinutes}</span><strong className="metric-value">{data.plan?.daily_minutes}</strong><span className="metric-note">{m.studyPlan.workload}</span></div></section><section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{m.studyPlan.priorities}</div><div className="panel-sub">{m.studyPlan.prioritiesSub}</div></div></div>{data.weak_concepts?.length ? <div className="admin-table">{data.weak_concepts.map(c => <div className="admin-row" key={c.id}><div><b>{c.name}</b><small>{c.type} · {c.attempts} attempts</small></div><span className={c.accuracy < 60 ? 'knowledge-risk' : ''}>{c.accuracy}%</span></div>)}</div> : <p className="panel-sub">{m.analytics.notEnoughDesc}</p>}</section><section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{m.studyPlan.change}</div></div></div><PlanForm {...{ exams, exam, setExam, date, setDate, minutes, setMinutes, saving, message, save }}/></section></div>; return <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{m.studyPlan.build}</div><div className="panel-sub">{m.studyPlan.buildSub}</div></div></div><PlanForm {...{ exams, exam, setExam, date, setDate, minutes, setMinutes, saving, message, save }}/></section>; }
type FormProps = {
    exams: Exam[];
    exam: string;
    setExam: (v: string) => void;
    date: string;
    setDate: (v: string) => void;
    minutes: number;
    setMinutes: (v: number) => void;
    saving: boolean;
    message: string;
    save: () => void;
};
function PlanForm(p: FormProps) { const { messages: m } = useI18n(); return <div className="form-grid-3"><label>{m.studyPlan.exam}<select className="input" value={p.exam} onChange={e => p.setExam(e.target.value)}>{p.exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>{m.studyPlan.targetDate}<input className="input" type="date" value={p.date} onChange={e => p.setDate(e.target.value)}/></label><label>{m.studyPlan.dailyMinutes}<input className="input" type="number" min="5" max="1440" value={p.minutes} onChange={e => p.setMinutes(Number(e.target.value))}/></label><div><button className="btn btn-primary" disabled={!p.exam || p.saving} onClick={p.save}>{p.saving ? m.auth.pleaseWait : m.studyPlan.savePlan}</button>{p.message && <div className="form-hint">{p.message}</div>}</div></div>; }

