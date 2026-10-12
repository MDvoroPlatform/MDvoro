'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { loginSchema, signUpSchema } from '@/lib/validation/auth';
import { useI18n } from '@/components/i18n/provider';
import { Turnstile } from '@/components/auth/turnstile';
import { isEmailSendRateLimitError } from '@/lib/auth/errors';

const CAPTCHA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
const REMEMBERED_EMAIL_KEY = 'mdvoro.remembered-email';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
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
    const captchaError = useRef(false);
    const [rememberEmail, setRememberEmail] = useState(false);

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

    return <form className="form" onSubmit={submit} noValidate>
        {mode === 'signup' ? <div className="field"><label htmlFor="fullName">{m.auth.fullName}</label><input id="fullName" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={80} /></div> : null}
        <div className="field"><label htmlFor="email">{m.auth.email}</label><input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></div>
        <div className="field"><label htmlFor="password">{m.auth.password}</label><input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} /></div>
        {mode === 'login' ? <div className="auth-form-options">
            <label className="auth-remember"><input type="checkbox" checked={rememberEmail} onChange={e => updateRememberEmail(e.target.checked)} /><span>{m.auth.rememberEmail}</span></label>
            <Link className="muted-link" href="/forgot-password">{m.auth.forgotPassword}</Link>
        </div> : null}
        {CAPTCHA_CONFIGURED ? <Turnstile key={captchaVersion} onToken={onCaptchaToken} onError={onCaptchaError} /> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {message ? <div className="form-success" role="status">{message}</div> : null}
        <button type="submit" className="btn btn-primary" disabled={loading || !captchaToken}>
            {loading ? m.auth.pleaseWait : mode === 'login' ? m.auth.signIn : m.auth.create}
        </button>
    </form>;
}
