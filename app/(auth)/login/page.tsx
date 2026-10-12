import Link from 'next/link';
import { AuthForm } from '@/components/auth/auth-form';
import { getI18n } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { MDvoroLogo } from '@/components/layout/mdvoro-logo';
import { Icon } from '@/components/ui/icons';

const copy = {
    en: { welcome: 'Welcome', back: 'back', line1: 'Continue your medical journey.', line2: 'Better preparation. Higher results.', email: 'Email address', password: 'Password', remember: 'Remember me', show: 'Show password', hide: 'Hide password', trust1: 'Built for medical', trust1b: 'students & doctors', trust2: 'Secure &', trust2b: 'reliable', trust3: 'Your success', trust3b: 'matters' },
    he: { welcome: 'ברוכים הבאים', back: '', line1: 'המשיכו במסע הרפואי שלכם.', line2: 'הכנה טובה יותר. תוצאות גבוהות יותר.', email: 'כתובת אימייל', password: 'סיסמה', remember: 'זכור אותי', show: 'הצג סיסמה', hide: 'הסתר סיסמה', trust1: 'נבנה עבור רפואה', trust1b: 'סטודנטים ורופאים', trust2: 'מאובטח', trust2b: 'ואמין', trust3: 'ההצלחה שלך', trust3b: 'חשובה לנו' },
    ar: { welcome: 'أهلاً بعودتك', back: '', line1: 'تابع رحلتك الطبية.', line2: 'تحضير أفضل. نتائج أعلى.', email: 'البريد الإلكتروني', password: 'كلمة المرور', remember: 'تذكرني', show: 'إظهار كلمة المرور', hide: 'إخفاء كلمة المرور', trust1: 'مصمم للتعليم', trust1b: 'الطبي والأطباء', trust2: 'آمن', trust2b: 'وموثوق', trust3: 'نجاحك', trust3b: 'يهمنا' },
    ru: { welcome: 'С возвращением', back: '', line1: 'Продолжайте свой путь в медицине.', line2: 'Лучшая подготовка. Лучшие результаты.', email: 'Электронная почта', password: 'Пароль', remember: 'Запомнить меня', show: 'Показать пароль', hide: 'Скрыть пароль', trust1: 'Для студентов', trust1b: 'и врачей', trust2: 'Безопасно', trust2b: 'и надёжно', trust3: 'Ваш успех', trust3b: 'важен' },
} as const;

export default async function Login() {
    const { messages: m, locale, dir } = await getI18n();
    const t = copy[locale];
    return <main className="auth-login-wrap" dir={dir}>
        <div className="auth-login-language"><LocaleSwitcher /></div>
        <div className="auth-login-content">
            <header className="auth-login-header">
                <MDvoroLogo />
                <p className="auth-login-tagline">LEARN. PRACTICE. EXCEL.</p>
                <h1 className="auth-login-title">{locale === 'en' ? <>{t.welcome} <span>{t.back}</span></> : t.welcome}</h1>
                <p className="auth-login-subtitle">{t.line1}<br />{t.line2}</p>
            </header>
            <section className="auth-login-card" aria-label={m.auth.signIn}>
                <AuthForm mode="login" loginCopy={{ email: t.email, password: t.password, remember: t.remember, show: t.show, hide: t.hide }} />
            </section>
            <p className="auth-login-footer">{m.auth.newTo} <Link href="/sign-up">{m.auth.createAccount}<Icon name="arrow" size={17} /></Link></p>
            <div className="auth-login-trust" aria-label="MDvoro benefits">
                <div className="auth-trust-item"><span><Icon name="graduation" size={25} /></span><p>{t.trust1}<br />{t.trust1b}</p></div>
                <i aria-hidden="true" />
                <div className="auth-trust-item"><span><Icon name="shield" size={24} /></span><p>{t.trust2}<br />{t.trust2b}</p></div>
                <i aria-hidden="true" />
                <div className="auth-trust-item"><span><Icon name="trending" size={24} /></span><p>{t.trust3}<br />{t.trust3b}</p></div>
            </div>
        </div>
        <svg className="auth-login-decoration auth-login-decoration-top" viewBox="0 0 360 330" aria-hidden="true"><path d="M-30 245C80 214 118 175 158 102S242 14 368-24"/><path d="M-18 280C98 246 148 199 184 124S272 41 380 4"/></svg>
        <svg className="auth-login-decoration auth-login-decoration-bottom" viewBox="0 0 360 330" aria-hidden="true"><path d="M-14 300C106 280 166 235 206 166S296 68 370 44"/><path d="M-10 330C110 308 185 268 228 196S310 105 374 84"/></svg>
        <svg className="auth-login-books" viewBox="0 0 210 150" aria-hidden="true"><path d="M8 112 148 78l52 25-139 39z"/><path d="m8 112 1 16 52 22 0-18z"/><path d="m61 132 139-35v16L61 150z"/><path d="m21 88 128-34 42 21L62 110z"/><path d="m21 88 1 15 40 17v-10z"/><path d="m62 110 129-35v15L62 120z"/><path d="m39 62 105-28 35 18L62 81z"/><path d="m39 62 1 13 22 10v-4z"/><path d="m62 81 117-29v14L62 90z"/></svg>
        <svg className="auth-login-stethoscope" viewBox="0 0 210 230" aria-hidden="true"><path d="M42 18v63c0 26 18 43 42 43s42-17 42-43V18"/><path d="M25 18v24M143 18v24"/><path d="M126 124v23c0 28 21 48 48 48h4"/><circle cx="190" cy="195" r="16"/><circle cx="190" cy="195" r="7"/><path d="M35 17h20M136 17h20"/></svg>
    </main>;
}
