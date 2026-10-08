'use client';
import { useState } from 'react';
import { csvToQuestionRows, normalizeImportedQuestion } from '@/lib/content/import';
const example = `[\n  {\n    "examId": "UUID",\n    "stem": "Clinical question…",\n    "subject": "Internal Medicine",\n    "topic": "Cardiology",\n    "options": [{"id":"A","text":"…"},{"id":"B","text":"…"}],\n    "answerKey": "B",\n    "explanation": "…",\n    "keyLearningPoint": "…",\n    "difficulty": 3\n  }\n]`;
export default function ImportPage() {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [format, setFormat] = useState<'json' | 'csv'>('json');
    async function importPayload(payload: unknown[]) {
        setBusy(true);
        setMessage('');
        try {
            const response = await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const body = await response.json();
            if (response.ok)
                setMessage(`Imported ${body.imported} questions as drafts. None were published.`);
            else
                setMessage(body.error === 'validation_failed' ? `Validation failed for ${body.invalid?.length ?? 'some'} rows. Fix them and import again.` : 'Import failed. No content was published.');
        }
        catch {
            setMessage('Could not reach the content service.');
        }
        setBusy(false);
    }
    async function run() {
        try {
            if (format === 'json') {
                const parsed = JSON.parse(text);
                if (!Array.isArray(parsed))
                    throw new Error('array');
                await importPayload(parsed);
            }
            else {
                const rows = csvToQuestionRows(text).map(normalizeImportedQuestion);
                await importPayload(rows);
            }
        }
        catch {
            setMessage(format === 'json' ? 'The JSON must be a valid array.' : 'The CSV header row is invalid or empty.');
            setBusy(false);
        }
    }
    async function loadFile(file: File) {
        setText(await file.text());
    }
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Bulk content</div><h1>Import questions</h1><p className="subtitle">Paste JSON or upload a simple CSV. MDvoro validates every row and imports everything as drafts.</p></div></div>
    <section className="card card-pad">
      <div className="segmented"><button className={format === 'json' ? 'active' : ''} onClick={() => setFormat('json')}>JSON</button><button className={format === 'csv' ? 'active' : ''} onClick={() => setFormat('csv')}>CSV</button></div>
      <label className="field"><span>Optional file</span><input type="file" accept={format === 'json' ? '.json,application/json' : '.csv,text/csv'} onChange={(e) => { const file = e.target.files?.[0]; if (file)
        void loadFile(file); }}/></label>
      <div className="section-title">{format === 'json' ? 'JSON array' : 'CSV content'}</div>
      <textarea className="import-editor" rows={22} value={text} onChange={(e) => setText(e.target.value)} placeholder={format === 'json' ? example : 'examId,stem,subject,topic,option_a,option_b,option_c,option_d,option_e,answerKey,explanation,keyLearningPoint,difficulty\nUUID,Clinical question…,Internal Medicine,Cardiology,A…,B…,C…,D…,E…,B,Explanation…,Takeaway…,3'}/>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy || !text.trim()} onClick={run}>{busy ? 'Validating & importing…' : 'Validate & import as drafts'}</button>{message && <span className="form-message">{message}</span>}</div>
    </section>
    <section className="card card-pad admin-section-gap"><div className="panel-title">Safe by default</div><p className="panel-sub import-note">Maximum 2,000 rows per transaction. Invalid rows are rejected before import. Every question gets a stable content code, version 1, an audit event and Draft status. Publishing always requires medical review.</p></section>
  </div>;
}

