'use client';
import { useState } from 'react';
export function UnderConstructionToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function update(next: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/site-status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: next }) });
      if (!response.ok) throw new Error('update_failed');
      setEnabled(next); setMessage(next ? 'Under construction is ON.' : 'Under construction is OFF.');
    } catch { setMessage('Could not update the launch mode.'); }
    finally { setBusy(false); }
  }
  return <div className="card card-pad"><div className="panel-head"><div><div className="panel-title">Launch mode</div><div className="panel-sub">Control the public landing route without changing the application code.</div></div><span className={`status-pill ${enabled ? 'warning' : 'success'}`}>{enabled ? 'Under construction' : 'Live'}</span></div><p className="metric-note">When enabled, the public home route shows the maintenance page. Authenticated admin routes remain available.</p><button className={`btn ${enabled ? '' : 'btn-primary'}`} disabled={busy} onClick={() => void update(!enabled)}>{busy ? 'Saving…' : enabled ? 'Disable under construction' : 'Enable under construction'}</button>{message && <span className="form-message">{message}</span>}</div>;
}
