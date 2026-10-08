'use client';
import { useState } from 'react';
type Mode = 'upload' | 'external';
export function MediaForm() {
    const [mode, setMode] = useState<Mode>('upload');
    const [kind, setKind] = useState('image');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [license, setLicense] = useState('');
    const [status, setStatus] = useState('review_required');
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit() {
        setBusy(true);
        setMessage('');
        const form = new FormData();
        form.set('kind', kind);
        form.set('title', title);
        form.set('licenseName', license);
        form.set('copyrightStatus', status);
        let response: Response;
        if (mode === 'upload') {
            if (!file) {
                setMessage('Choose a file first.');
                setBusy(false);
                return;
            }
            form.set('file', file);
            form.set('altText', title);
            response = await fetch('/api/admin/media/upload', { method: 'POST', body: form });
        }
        else {
            response = await fetch('/api/admin/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, title, externalUrl: url, storagePath: '', licenseName: license, copyrightStatus: status, attributionRequired: false, commercialUseAllowed: null, altText: '', licenseUrl: '', attributionText: '', mimeType: '', sourceId: null }) });
        }
        const body = await response.json().catch(() => ({}));
        setMessage(response.ok ? 'Asset added to the library.' : body.error === 'file_too_large' ? 'That file is too large.' : 'Could not add this asset.');
        if (response.ok) {
            setTitle('');
            setUrl('');
            setLicense('');
            setFile(null);
        }
        setBusy(false);
    }
    return <section className="card card-pad">
    <div className="panel-title">Add reusable asset</div>
    <p className="panel-sub media-help">Upload a file or register a licensed external asset. The same asset can be attached to unlimited questions.</p>
    <div className="segmented"><button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>Upload file</button><button className={mode === 'external' ? 'active' : ''} onClick={() => setMode('external')}>External URL</button></div>
    <div className="form">
      <label className="field"><span>Type</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{['image', 'ecg', 'xray', 'ct', 'mri', 'pathology', 'diagram', 'video', 'audio', 'document'].map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ECG — atrial fibrillation"/></label>
      {mode === 'upload' ? <label className="field"><span>File</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,audio/mpeg,audio/wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/></label> : <label className="field"><span>External URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"/></label>}
      <label className="field"><span>License</span><input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Original / CC BY 4.0 / Public domain"/></label>
      <label className="field"><span>Copyright status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="original">Original</option><option value="public_domain">Public domain</option><option value="licensed">Licensed</option><option value="review_required">Review required</option></select></label>
      <button className="btn btn-primary" disabled={busy || !title || (mode === 'upload' ? !file : !url)} onClick={submit}>{busy ? 'Adding…' : 'Add to library'}</button>
      {message && <div className="form-message">{message}</div>}
    </div>
  </section>;
}

