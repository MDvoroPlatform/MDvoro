'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/provider';
export function PasswordResetRequestForm() {
    const { messages: m } = useI18n();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
            });
            setMessage(error ? m.auth.genericError : m.auth.resetEmailSent);
        }
        catch {
            setMessage(m.auth.genericError);
        }
        finally {
            setBusy(false);
        }
    }
    return (<form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="reset-email">{m.auth.email}</label>
        <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254}/>
      </div>
      {message && <div className="form-success" role="status">{message}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? m.auth.pleaseWait : m.common.save}</button>
    </form>);
}
export function PasswordUpdateForm() {
    const { messages: m } = useI18n();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setMessage('');
        if (password.length < 8 || password !== confirm) {
            setMessage(m.auth.genericError);
            return;
        }
        setBusy(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password });
            setMessage(error ? m.auth.genericError : m.common.saved);
        }
        catch {
            setMessage(m.auth.genericError);
        }
        finally {
            setBusy(false);
        }
    }
    return (<form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="new-password">{m.auth.password}</label>
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required/>
      </div>
      <div className="field">
        <label htmlFor="confirm-password">{m.auth.password}</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} maxLength={128} required/>
      </div>
      {message && <div className="form-success" role="status">{message}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? m.auth.pleaseWait : m.common.save}</button>
    </form>);
}

