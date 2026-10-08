'use client';
import { useState } from 'react';

export function CopyrightNoticeControls({ noticeId, status }: { noticeId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(status);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  async function save() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/audit/copyright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noticeId, status: value, note }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'copyright_update_failed');
      setMessage('Saved');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed');
    } finally { setBusy(false); }
  }

  return <div className="admin-inline-actions">
    <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
      <option value="open">Open</option>
      <option value="in_review">In review</option>
      <option value="resolved">Resolved</option>
      <option value="rejected">Rejected</option>
    </select>
    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder="Resolution note" disabled={busy} />
    <button className="btn btn-sm" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    {message && <small>{message}</small>}
  </div>;
}
