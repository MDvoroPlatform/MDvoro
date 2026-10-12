import Link from 'next/link';
import { AuthForm } from '@/components/auth/auth-form';
import { AuthPageFrame } from '@/components/auth/auth-page-frame';
import { getI18n } from '@/lib/i18n/server';
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
  const trust = <div className="auth-login-trust" aria-label="MDvoro benefits">
    <div className="auth-trust-item"><span><Icon name="graduation" size={25} /></span><p>{t.trust1}<br />{t.trust1b}</p></div>
    <i aria-hidden="true" />
    <div className="auth-trust-item"><span><Icon name="shield" size={24} /></span><p>{t.trust2}<br />{t.trust2b}</p></div>
    <i aria-hidden="true" />
    <div className="auth-trust-item"><span><Icon name="trending" size={24} /></span><p>{t.trust3}<br />{t.trust3b}</p></div>
  </div>;
  return <AuthPageFrame
    dir={dir}
    label={m.auth.signIn}
    title={locale === 'en' ? <>{t.welcome} <span>{t.back}</span></> : t.welcome}
    subtitle={<>{t.line1}<br />{t.line2}</>}
    footer={<p className="auth-login-footer">{m.auth.newTo} <Link href="/sign-up">{m.auth.createAccount}<Icon name="arrow" size={17} /></Link></p>}
    trust={trust}
  >
    <AuthForm mode="login" loginCopy={{ email: t.email, password: t.password, remember: t.remember, show: t.show, hide: t.hide }} />
  </AuthPageFrame>;
}
