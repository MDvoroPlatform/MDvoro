'use client';

import { useState } from 'react';

export function QBankIssueReportControls({ reportId, initialStatus, initialNote }: { reportId: string; initialStatus: string; initialNote: string | null }) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/qbank-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportId, status, note }),
      });
      if (!response.ok) throw new Error('Could not update this report.');
      setMessage('Updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update this report.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="qbank-report-controls">
    <select aria-label="Report status" value={status} onChange={(event) => setStatus(event.target.value)}>
      <option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
    </select>
    <textarea aria-label="Resolution note" maxLength={2000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Resolution note (optional)"/>
    <div className="admin-inline-actions"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save update'}</button>{message && <span className="panel-sub" role="status">{message}</span>}</div>
  </div>;
}
