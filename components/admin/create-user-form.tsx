'use client';

import { useState, type FormEvent } from 'react';

export function CreateUserForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !expiresOn) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email,
          password,
          expiresAt: new Date(`${expiresOn}T23:59:59`).toISOString(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messageByCode: Record<string, string> = {
          admin_auth_not_configured: 'Server account management is not configured yet. Contact the site administrator.',
          email_already_registered: 'This email already has an account.',
          invalid_expiration: 'Choose a future expiration date.',
        };
        setMessage(messageByCode[body.error] ?? body.error ?? 'Could not create the account.');
        return;
      }
      setEmail('');
      setPassword('');
      setExpiresOn('');
      setMessage('Account created with premium access.');
      window.location.reload();
    } catch {
      setMessage('Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="card card-pad admin-section-gap">
    <div className="panel-head"><div><div className="panel-title">Create account & grant access</div><div className="panel-sub">The account is confirmed immediately and receives premium access through the selected date.</div></div></div>
    <form className="admin-create-user-form" onSubmit={(event) => void submit(event)}>
      <label className="field"><span>Email</span><input type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label className="field"><span>Temporary password</span><input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)}/></label>
      <label className="field"><span>Premium access through</span><input type="date" required min={new Date().toISOString().slice(0, 10)} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)}/></label>
      <button className="btn btn-primary" disabled={busy || !email || password.length < 8 || !expiresOn} type="submit">{busy ? 'Creating…' : 'Create account'}</button>
    </form>
    {message && <p className="panel-sub" role="status">{message}</p>}
  </section>;
}
