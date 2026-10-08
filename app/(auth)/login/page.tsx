import Link from 'next/link';
import { AuthForm } from '@/components/auth/auth-form';
import { getI18n } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { ThemeToggle } from '@/components/i18n/theme-toggle';
export default async function Login() { const { messages: m } = await getI18n(); return <main className="auth-wrap"><div className="auth-top-tools"><LocaleSwitcher /><ThemeToggle /></div><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark auth-brand-mark">MD</span><span className="brand-name auth-brand-name">MD<span>voro</span></span></div><div className="eyebrow">{m.auth.loginEyebrow}</div><h1 className="auth-title">{m.auth.welcome}</h1><p className="subtitle">{m.auth.loginSubtitle}</p><AuthForm mode="login"/><p className="auth-footer">{m.auth.newTo} <Link className="muted-link" href="/sign-up">{m.auth.createAccount}</Link></p></section></main>; }

