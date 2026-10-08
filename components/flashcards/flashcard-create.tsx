'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/provider';
export function FlashcardCreate() { const { messages: m } = useI18n(); const router = useRouter(); const [open, setOpen] = useState(false), [front, setFront] = useState(''), [back, setBack] = useState(''), [type, setType] = useState('basic'), [busy, setBusy] = useState(false), [message, setMessage] = useState(''); async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setMessage(''); try {
    const r = await fetch('/api/flashcards/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ front, back, cardType: type }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
        setMessage(m.qbank.couldNotCreate);
        return;
    }
    setFront('');
    setBack('');
    setMessage(m.common.saved);
    router.refresh();
}
finally {
    setBusy(false);
} } if (!open)
    return <button className="btn btn-primary" onClick={() => setOpen(true)}>{m.common.new} {m.flashcards.title}</button>; return <form className="card card-pad fc-create" onSubmit={submit}><div className="panel-head"><div><div className="panel-title">{m.flashcards.build}</div><div className="panel-sub">{m.flashcards.buildDesc}</div></div><button type="button" className="btn" onClick={() => setOpen(false)}>{m.common.back}</button></div><div className="form-grid-2"><label className="field"><span>{m.flashcards.frontLabel}</span><textarea rows={5} value={front} onChange={e => setFront(e.target.value)} required/></label><label className="field"><span>{m.flashcards.backLabel}</span><textarea rows={5} value={back} onChange={e => setBack(e.target.value)} required/></label></div><label className="field"><span>{m.flashcards.cardType}</span><select value={type} onChange={e => setType(e.target.value)}><option value="basic">{m.flashcards.cardTypes.basic}</option><option value="clinical">{m.flashcards.cardTypes.clinical}</option><option value="rapid_recall">{m.flashcards.cardTypes.rapid_recall}</option><option value="cloze">{m.flashcards.cardTypes.cloze}</option></select></label><div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? m.auth.pleaseWait : m.common.save}</button>{message && <span className="form-message">{message}</span>}</div></form>; }

