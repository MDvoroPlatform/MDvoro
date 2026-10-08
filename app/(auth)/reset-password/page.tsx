import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { ThemeToggle } from '@/components/i18n/theme-toggle';
import { PasswordUpdateForm } from '@/components/auth/password-reset-form';
export default async function ResetPasswordPage() {
    const { messages: m } = await getI18n();
    return <main className="auth-wrap"><div className="auth-top-tools"><LocaleSwitcher /><ThemeToggle /></div><section className="auth-card"><div className="eyebrow">{m.auth.recovery}</div><h1 className="auth-title">{m.auth.newPasswordTitle}</h1><p className="subtitle">{m.auth.newPasswordSubtitle}</p><PasswordUpdateForm /><p className="auth-footer"><Link className="muted-link" href="/login">{m.auth.backToSignIn}</Link></p></section></main>;
}

