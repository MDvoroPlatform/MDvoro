import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { AuthPageFrame } from '@/components/auth/auth-page-frame';
import { PasswordUpdateForm } from '@/components/auth/password-reset-form';
export default async function ResetPasswordPage() {
    const { messages: m, dir } = await getI18n();
    return <AuthPageFrame dir={dir} label={m.auth.recovery} title={m.auth.newPasswordTitle} subtitle={m.auth.newPasswordSubtitle} footer={<p className="auth-login-footer"><Link href="/login">{m.auth.backToSignIn}</Link></p>}><PasswordUpdateForm /></AuthPageFrame>;
}

