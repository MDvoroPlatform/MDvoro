import Link from 'next/link';
import { AuthForm } from '@/components/auth/auth-form';
import { getI18n } from '@/lib/i18n/server';
import { AuthPageFrame } from '@/components/auth/auth-page-frame';
export default async function SignUp() { const { messages: m, dir } = await getI18n(); return <AuthPageFrame dir={dir} label={m.auth.createTitle} title={m.auth.createTitle} subtitle={m.auth.signupSubtitle} footer={<p className="auth-login-footer">{m.auth.already} <Link href="/login">{m.auth.signIn}</Link></p>}><AuthForm mode="signup" /></AuthPageFrame>; }

