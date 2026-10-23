'use client';

import { useState, type FormEvent } from 'react';

export function UserControls({
  userId,
  status,
  currentUserId,
  canManageUsers = false,
}: {
  userId: string;
  status: string;
  currentUserId: string;
  canManageUsers?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const self = userId === currentUserId;

  async function mutate(payload: Record<string, string>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || 'Operation failed');
        return;
      }
      setMessage('Saved');
      window.location.reload();
    } catch {
      setMessage('Operation failed');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return;
    await mutate({ action: 'password', password });
    setPassword('');
  }

  async function grantSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expiresOn) return;
    const expiresAt = new Date(`${expiresOn}T23:59:59`).toISOString();
    await mutate({ action: 'subscription', expiresAt });
  }

  return (
    <div className="admin-user-controls">
      <div className="role-editor">
        <span className={`status ${status === 'active' ? 'status-published' : 'status-draft'}`}>{status}</span>
        <button className="btn btn-sm" disabled={busy || self} onClick={() => void mutate({ action: 'status', status: status === 'active' ? 'suspended' : 'active' })} type="button">
          {status === 'active' ? 'Suspend' : 'Reactivate'}
        </button>
        {canManageUsers && <button className="btn btn-sm btn-danger" disabled={busy || self} onClick={() => window.confirm('Permanently delete this user?') && void mutate({ action: 'delete' })} type="button">Delete</button>}
      </div>
      {canManageUsers && <details className="admin-user-tools">
        <summary>Access & password</summary>
        <form onSubmit={(event) => void grantSubscription(event)}>
          <label>Premium access through <input type="date" required min={new Date().toISOString().slice(0, 10)} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)}/></label>
          <button className="btn btn-sm btn-primary" disabled={busy || !expiresOn} type="submit">Grant access</button>
        </form>
        <form onSubmit={(event) => void changePassword(event)}>
          <label>New password <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)}/></label>
          <button className="btn btn-sm" disabled={busy || password.length < 8} onClick={(event) => { if (!window.confirm('Set a new password for this user?')) event.preventDefault(); }} type="submit">Set password</button>
        </form>
      </details>}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
