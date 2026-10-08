import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';

const copy = {
  en: { eyebrow: 'MDvoro', title: 'We are preparing something better.', text: 'MDvoro is temporarily under construction while we prepare the platform for launch. Please check back soon.', note: 'Your learning data is protected and the service is not available for public study while this mode is active.', home: 'Back to home' },
  he: { eyebrow: 'MDvoro', title: 'אנחנו מכינים משהו טוב יותר.', text: 'MDvoro נמצא כרגע בתהליך הכנה לקראת ההשקה. נחזור בקרוב.', note: 'הנתונים שלך מוגנים והשירות אינו זמין ללמידה ציבורית בזמן שמצב זה פעיל.', home: 'חזרה לדף הבית' },
  ar: { eyebrow: 'MDvoro', title: 'نحن نجهّز شيئًا أفضل.', text: 'MDvoro قيد التجهيز مؤقتًا استعدادًا للإطلاق. سنعود قريبًا.', note: 'بياناتك محمية والخدمة غير متاحة للدراسة العامة أثناء تفعيل هذا الوضع.', home: 'العودة للرئيسية' },
  ru: { eyebrow: 'MDvoro', title: 'Мы готовим кое-что лучше.', text: 'MDvoro временно находится на этапе подготовки к запуску. Скоро вернёмся.', note: 'Ваши учебные данные защищены, а публичное обучение недоступно, пока включён этот режим.', home: 'На главную' },
} as const;

export default async function UnderConstructionPage() {
  const { locale } = await getI18n();
  const t = copy[locale];
  return <main className="maintenance-page"><div className="maintenance-card card"><div className="eyebrow">{t.eyebrow}</div><div className="maintenance-mark">M</div><h1>{t.title}</h1><p>{t.text}</p><div className="security-note">{t.note}</div><Link className="btn btn-primary" href="/">{t.home}</Link></div></main>;
}
