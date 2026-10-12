import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { MDvoroLogo } from '@/components/layout/mdvoro-logo';

export function AuthPageFrame({
  title,
  subtitle,
  children,
  footer,
  trust,
  label,
  dir,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  trust?: ReactNode;
  label: string;
  dir: 'ltr' | 'rtl';
}) {
  return <main className="auth-login-wrap" dir={dir}>
    <div className="auth-login-language"><LocaleSwitcher /></div>
    <div className="auth-login-content">
      <header className="auth-login-header">
        <MDvoroLogo forceLight />
        <p className="auth-login-tagline">LEARN. PRACTICE. EXCEL.</p>
        <h1 className="auth-login-title">{title}</h1>
        <p className="auth-login-subtitle">{subtitle}</p>
      </header>
      <section className="auth-login-card" aria-label={label}>{children}</section>
      {footer}
      {trust}
    </div>
    <svg className="auth-login-decoration auth-login-decoration-top" viewBox="0 0 360 330" aria-hidden="true"><path d="M-30 245C80 214 118 175 158 102S242 14 368-24"/><path d="M-18 280C98 246 148 199 184 124S272 41 380 4"/></svg>
    <svg className="auth-login-decoration auth-login-decoration-bottom" viewBox="0 0 360 330" aria-hidden="true"><path d="M-14 300C106 280 166 235 206 166S296 68 370 44"/><path d="M-10 330C110 308 185 268 228 196S310 105 374 84"/></svg>
    <svg className="auth-login-books" viewBox="0 0 210 150" aria-hidden="true"><path d="M8 112 148 78l52 25-139 39z"/><path d="m8 112 1 16 52 22 0-18z"/><path d="m61 132 139-35v16L61 150z"/><path d="m21 88 128-34 42 21L62 110z"/><path d="m21 88 1 15 40 17v-10z"/><path d="m62 110 129-35v15L62 120z"/><path d="m39 62 105-28 35 18L62 81z"/><path d="m39 62 1 13 22 10v-4z"/><path d="m62 81 117-29v14L62 90z"/></svg>
    <svg className="auth-login-stethoscope" viewBox="0 0 210 230" aria-hidden="true"><path d="M42 18v63c0 26 18 43 42 43s42-17 42-43V18"/><path d="M25 18v24M143 18v24"/><path d="M126 124v23c0 28 21 48 48 48h4"/><circle cx="190" cy="195" r="16"/><circle cx="190" cy="195" r="7"/><path d="M35 17h20M136 17h20"/></svg>
  </main>;
}
