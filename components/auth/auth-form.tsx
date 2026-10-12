'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { loginSchema, signUpSchema } from '@/lib/validation/auth';
import { useI18n } from '@/components/i18n/provider';
import { Turnstile } from '@/components/auth/turnstile';
import { isEmailSendRateLimitError } from '@/lib/auth/errors';
import { Icon } from '@/components/ui/icons';

const CAPTCHA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
const REMEMBERED_EMAIL_KEY = 'mdvoro.remembered-email';

export function AuthForm({ mode, loginCopy }: { mode: 'login' | 'signup'; loginCopy?: { email: string; password: string; remember: string; show: string; hide: string } }) {
    const router = useRouter();
    const { messages: m } = useI18n();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaVersion, setCaptchaVersion] = useState(0);
    const [oauthLoading, setOauthLoading] = useState(false);
    const captchaError = useRef(false);
    const [rememberEmail, setRememberEmail] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('error') !== 'oauth') return;
        const timer = window.setTimeout(() => setError(m.auth.googleError), 0);
        return () => window.clearTimeout(timer);
    }, [m.auth.googleError]);

    useEffect(() => {
        if (mode !== 'login') return;
        let timer: number | undefined;
        try {
            const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
            if (rememberedEmail) {
                timer = window.setTimeout(() => {
                    setEmail(rememberedEmail);
                    setRememberEmail(true);
                }, 0);
            }
        } catch {
            // Login still works when browser storage is unavailable.
        }
        return () => {
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [mode]);

    const onCaptchaToken = useCallback((token: string) => {
        setCaptchaToken(token);
        if (captchaError.current) {
            captchaError.current = false;
            setError('');
        }
    }, []);
    const onCaptchaError = useCallback(() => {
        captchaError.current = true;
        setCaptchaToken('');
        setError(m.auth.genericError);
    }, [m.auth.genericError]);

    function updateRememberEmail(checked: boolean) {
        setRememberEmail(checked);
        if (!checked) {
            try {
                window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
            } catch {
                // Login still works when browser storage is unavailable.
            }
        }
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setMessage('');
        captchaError.current = false;
        setLoading(true);
        let attemptedAuth = false;
        try {
            const supabase = createClient();
            if (mode === 'signup') {
                if (!CAPTCHA_CONFIGURED || !captchaToken) {
                    setError(m.auth.genericError);
                    return;
                }
                const parsed = signUpSchema.safeParse({ email, password, fullName });
                if (!parsed.success) {
                    setError(parsed.error.issues[0]?.message ?? m.auth.genericError);
                    return;
                }
                attemptedAuth = true;
                const result = await supabase.auth.signUp({
                    email: parsed.data.email,
                    password: parsed.data.password,
                    options: {
                        captchaToken,
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                        data: { full_name: parsed.data.fullName },
                    },
                });
                if (result.error) {
                    setError(isEmailSendRateLimitError(result.error) ? m.auth.emailRateLimited : m.auth.genericError);
                    return;
                }
                setCaptchaToken('');
                setMessage(m.auth.accountCreated);
            } else {
                if (!CAPTCHA_CONFIGURED || !captchaToken) {
                    setError(m.auth.genericError);
                    return;
                }
                const parsed = loginSchema.safeParse({ email, password });
                if (!parsed.success) {
                    setError(parsed.error.issues[0]?.message ?? m.auth.genericError);
                    return;
                }
                attemptedAuth = true;
                const result = await supabase.auth.signInWithPassword({
                    email: parsed.data.email,
                    password: parsed.data.password,
                    options: { captchaToken },
                });
                if (result.error) {
                    setError(m.auth.genericError);
                    return;
                }
                try {
                    if (rememberEmail) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, parsed.data.email);
                    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
                } catch {
                    // Session sign-in succeeds even when browser storage is unavailable.
                }
                router.replace('/dashboard');
            }
        } catch {
            setError(m.auth.genericError);
        } finally {
            setLoading(false);
            if (attemptedAuth) {
                setCaptchaToken('');
                setCaptchaVersion((version) => version + 1);
            }
        }
    }

    async function signInWithGoogle() {
        setError('');
        setMessage('');
        setOauthLoading(true);
        try {
            const supabase = createClient();
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    queryParams: { prompt: 'select_account' },
                },
            });
            if (oauthError) setError(m.auth.googleError);
        } catch {
            setError(m.auth.googleError);
        } finally {
            setOauthLoading(false);
        }
    }

    const googleButton = <button type="button" className="btn btn-google" onClick={signInWithGoogle} disabled={oauthLoading || loading}>
            <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>
            <span>{oauthLoading ? m.auth.pleaseWait : m.auth.continueGoogle}</span>
        </button>;
    const divider = <div className="auth-divider" aria-hidden="true">{m.auth.or}</div>;
    const emailField = <div className="field auth-login-field"><label htmlFor="email">{loginCopy?.email ?? m.auth.email}</label><div className="auth-login-input"><Icon name="mail" size={21} /><input id="email" type="email" autoComplete="email" placeholder="you@mdvoro.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></div></div>;
    const passwordField = <div className="field auth-login-field"><label htmlFor="password">{loginCopy?.password ?? m.auth.password}</label><div className="auth-login-input"><Icon name="lock" size={21} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? loginCopy?.hide ?? 'Hide password' : loginCopy?.show ?? 'Show password'} aria-pressed={showPassword}><Icon name="eye" size={21} /></button></div></div>;
    const rememberRow = <div className="auth-form-options">
            <label className="auth-remember"><input type="checkbox" checked={rememberEmail} onChange={e => updateRememberEmail(e.target.checked)} /><span>{loginCopy?.remember ?? m.auth.rememberEmail}</span></label>
            <Link className="muted-link" href="/forgot-password">{m.auth.forgotPassword}</Link>
        </div>;

    return <form className="form auth-login-form" onSubmit={submit} noValidate>
        {mode === 'login' ? <>
            {emailField}
            {passwordField}
            {rememberRow}
        </> : <>
            {googleButton}
            {divider}
            <div className="field"><label htmlFor="fullName">{m.auth.fullName}</label><input id="fullName" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={80} /></div>
            {emailField}
            {passwordField}
        </>}
        {CAPTCHA_CONFIGURED ? <Turnstile key={captchaVersion} onToken={onCaptchaToken} onError={onCaptchaError} /> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {message ? <div className="form-success" role="status">{message}</div> : null}
        <button type="submit" className="btn btn-primary auth-login-submit" disabled={loading || !captchaToken}>
            {loading ? m.auth.pleaseWait : mode === 'login' ? <>{m.auth.signIn}<Icon name="arrow" size={21} /></> : m.auth.create}
        </button>
        {mode === 'login' ? <>{divider}{googleButton}</> : null}
    </form>;
}
