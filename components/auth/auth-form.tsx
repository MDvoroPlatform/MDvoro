'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { loginSchema, signUpSchema } from '@/lib/validation/auth';
import { useI18n } from '@/components/i18n/provider';
import { Turnstile } from '@/components/auth/turnstile';

const CAPTCHA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

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

    const onCaptchaToken = useCallback((token: string) => {
        setCaptchaToken(token);
        setError('');
    }, []);
    const onCaptchaError = useCallback(() => {
        setCaptchaToken('');
        setError(m.auth.genericError);
    }, [m.auth.genericError]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
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
                    setError(m.auth.genericError);
                    return;
                }
                setCaptchaToken('');
                setMessage(m.auth.accountCreated);
            } else {
                const parsed = loginSchema.safeParse({ email, password });
                if (!parsed.success) {
                    setError(parsed.error.issues[0]?.message ?? m.auth.genericError);
                    return;
                }
                const result = await supabase.auth.signInWithPassword({
                    email: parsed.data.email,
                    password: parsed.data.password,
                });
                if (result.error) {
                    setError(m.auth.genericError);
                    return;
                }
                router.replace('/dashboard');
            }
        } catch {
            setError(m.auth.genericError);
        } finally {
            setLoading(false);
        }
    }

    return <form className="form" onSubmit={submit} noValidate>
        {mode === 'signup' ? <div className="field"><label htmlFor="fullName">{m.auth.fullName}</label><input id="fullName" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={80} /></div> : null}
        <div className="field"><label htmlFor="email">{m.auth.email}</label><input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></div>
        <div className="field"><label htmlFor="password">{m.auth.password}</label><input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} /></div>
        {mode === 'signup' ? <Turnstile onToken={onCaptchaToken} onError={onCaptchaError} /> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {message ? <div className="form-success" role="status">{message}</div> : null}
        <button type="submit" className="btn btn-primary" disabled={loading || (mode === 'signup' && !captchaToken)}>
            {loading ? m.auth.pleaseWait : mode === 'login' ? m.auth.signIn : m.auth.create}
        </button>
    </form>;
}
