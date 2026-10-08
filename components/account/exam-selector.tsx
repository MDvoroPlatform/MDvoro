'use client';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/provider';
type Exam = {
    id: string;
    code: string;
    name: string;
};
export function ExamSelector({ exams, current }: {
    exams: Exam[];
    current: string | null;
}) { const { messages: m } = useI18n(); const [value, setValue] = useState(current ?? ''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''); async function save() { setBusy(true); setMessage(''); const res = await fetch('/api/account/exam', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examId: value }) }); setMessage(res.ok ? m.common.saved : m.studyPlan.couldNotSave); setBusy(false); } return <div className="form"><label className="field"><span>{m.studyPlan.exam}</span><select value={value} onChange={e => setValue(e.target.value)}><option value="">{m.common.allContent}</option>{exams.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></label><button className="btn btn-primary" disabled={busy || !value} onClick={save}>{busy ? m.auth.pleaseWait : m.common.save}</button>{message && <span className="form-message">{message}</span>}</div>; }

