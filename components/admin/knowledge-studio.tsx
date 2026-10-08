'use client';
import { useState, useTransition } from 'react';
type Card = {
    id: string;
    stable_code: string;
    title: string;
    summary: string | null;
    status: string;
    updated_at: string;
};
export function KnowledgeStudio({ initialCards }: {
    initialCards: Card[];
}) { const [cards, setCards] = useState(initialCards), [title, setTitle] = useState(''), [summary, setSummary] = useState(''), [bodyMd, setBodyMd] = useState(''), [busy, start] = useTransition(), [message, setMessage] = useState(''); function create() { start(async () => { setMessage(''); const r = await fetch('/api/admin/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, summary, bodyMd }) }); const b = await r.json().catch(() => ({})); if (!r.ok) {
    setMessage('Could not create the knowledge card.');
    return;
} setCards([{ id: b.id, stable_code: 'NEW', title, summary, status: 'draft', updated_at: new Date().toISOString() }, ...cards]); setTitle(''); setSummary(''); setBodyMd(''); setMessage('Draft created.'); }); } return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Medical knowledge layer</div><h1>Knowledge cards</h1><p className="subtitle">Reusable, reviewed medical knowledge that connects questions, taxonomy and future AI suggestions.</p></div></div><section className="card card-pad admin-section-gap"><div className="panel-head"><div><div className="panel-title">Create a knowledge card</div><div className="panel-sub">One concept can support hundreds of questions without duplicated content.</div></div></div><div className="form-grid-2"><label className="field"><span>Title</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Atrial fibrillation — rate control"/></label><label className="field"><span>Summary</span><input value={summary} onChange={e => setSummary(e.target.value)} placeholder="High-yield overview"/></label></div><label className="field"><span>Knowledge body (Markdown)</span><textarea rows={12} value={bodyMd} onChange={e => setBodyMd(e.target.value)} placeholder="Definition, mechanism, diagnosis, management, pitfalls…"/></label><div className="form-actions"><button className="btn btn-primary" disabled={busy || title.trim().length < 2 || bodyMd.trim().length < 10} onClick={create}>{busy ? 'Saving…' : 'Create draft'}</button>{message && <span className="form-hint">{message}</span>}</div></section><section className="card card-pad"><div className="panel-head"><div><div className="panel-title">Knowledge library</div><div className="panel-sub">{cards.length} cards · governed by the same review architecture.</div></div></div><div className="admin-table">{cards.length ? cards.map(c => <div className="admin-row" key={c.id}><div><b>{c.title}</b><small>{c.stable_code} · {c.status}</small></div><span>{new Date(c.updated_at).toLocaleDateString()}</span></div>) : <div className="empty-panel"><b>No knowledge cards yet</b><span>Create the first reusable concept above.</span></div>}</div></section></div>; }

