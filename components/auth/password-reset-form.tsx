'use client';
import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/provider';
import { Turnstile } from '@/components/auth/turnstile';
import { loginSchema } from '@/lib/validation/auth';

const CAPTCHA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export function PasswordResetRequestForm() {
    const { messages: m } = useI18n();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaVersion, setCaptchaVersion] = useState(0);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const captchaError = useRef(false);
    const onCaptchaToken = useCallback((token: string) => {
        setCaptchaToken(token);
        if (captchaError.current) {
            captchaError.current = false;
            setMessage('');
            setIsError(false);
        }
    }, []);
    const onCaptchaError = useCallback(() => {
        captchaError.current = true;
        setCaptchaToken('');
        setMessage(m.auth.genericError);
        setIsError(true);
    }, [m.auth.genericError]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setMessage('');
        setIsError(false);
        captchaError.current = false;
        const parsedEmail = loginSchema.shape.email.safeParse(email);
        if (!parsedEmail.success || !CAPTCHA_CONFIGURED || !captchaToken) {
            setMessage(m.auth.genericError);
            setIsError(true);
            return;
        }
        setBusy(true);
        let attemptedRequest = false;
        try {
            const supabase = createClient();
            attemptedRequest = true;
            const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
                redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
                captchaToken,
            });
            setMessage(error ? m.auth.genericError : m.auth.resetEmailSent);
            setIsError(Boolean(error));
        }
        catch {
            setMessage(m.auth.genericError);
            setIsError(true);
        }
        finally {
            setBusy(false);
            if (attemptedRequest) {
                setCaptchaToken('');
                setCaptchaVersion((version) => version + 1);
            }
        }
    }
    return (<form className="form auth-login-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="reset-email">{m.auth.email}</label>
        <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254}/>
      </div>
      {CAPTCHA_CONFIGURED ? <Turnstile key={captchaVersion} onToken={onCaptchaToken} onError={onCaptchaError} /> : null}
      {message && <div className={isError ? 'form-error' : 'form-success'} role={isError ? 'alert' : 'status'}>{message}</div>}
      <button type="submit" className="btn btn-primary auth-login-submit" disabled={busy || !email.trim() || !captchaToken}>{busy ? m.auth.pleaseWait : m.common.save}</button>
    </form>);
}
export function PasswordUpdateForm() {
    const { messages: m } = useI18n();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setMessage('');
        setIsError(false);
        if (password.length < 8 || password !== confirm) {
            setMessage(m.auth.genericError);
            setIsError(true);
            return;
        }
        setBusy(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password });
            setMessage(error ? m.auth.genericError : m.common.saved);
            setIsError(Boolean(error));
        }
        catch {
            setMessage(m.auth.genericError);
            setIsError(true);
        }
        finally {
            setBusy(false);
        }
    }
    return (<form className="form auth-login-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="new-password">{m.auth.password}</label>
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required/>
      </div>
      <div className="field">
        <label htmlFor="confirm-password">{m.auth.confirmPassword}</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} maxLength={128} required/>
      </div>
      {message && <div className={isError ? 'form-error' : 'form-success'} role={isError ? 'alert' : 'status'}>{message}</div>}
      <button type="submit" className="btn btn-primary auth-login-submit" disabled={busy || password.length < 8 || password !== confirm}>{busy ? m.auth.pleaseWait : m.common.save}</button>
    </form>);
}
