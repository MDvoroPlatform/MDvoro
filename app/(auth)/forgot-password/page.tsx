import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { ThemeToggle } from '@/components/i18n/theme-toggle';
import { PasswordResetRequestForm } from '@/components/auth/password-reset-form';
export default async function ForgotPassword() {
    const { messages: m } = await getI18n();
    return (<main className="auth-wrap">
      <div className="auth-top-tools"><LocaleSwitcher /><ThemeToggle /></div>
      <section className="auth-card">
        <div className="eyebrow">{m.auth.recovery}</div>
        <h1 className="auth-title">{m.auth.reset}</h1>
        <p className="subtitle">{m.auth.resetSubtitle}</p>
        <PasswordResetRequestForm />
        <p className="auth-footer"><Link className="muted-link" href="/login">{m.auth.backToSignIn}</Link></p>
      </section>
    </main>);
}

