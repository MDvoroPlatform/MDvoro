'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';
const NAV_ITEMS = [
    ['/dashboard', 'dashboard', 'grid'],
    ['/qbank', 'qbank', 'book'],
    ['/flashcards', 'flashcards', 'cards'],
    ['/study-plan', 'studyPlan', 'calendar'],
    ['/exam-guide', 'examGuide', 'book'],
    ['/analytics', 'analytics', 'chart'],
    ['/leaderboard', 'leaderboard', 'trophy'],
    ['/library', 'library', 'book'],
    ['/knowledge', 'knowledge', 'brain'],
    ['/notebook', 'notebook', 'bookmark'],
    ['/settings', 'settings', 'settings'],
] as const;
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
export function PrimaryNav({ staff }: {
    staff: boolean;
}) {
    const pathname = usePathname();
    const { messages, locale } = useI18n();
    return <>
    <nav className="nav" aria-label="Primary navigation">
      {NAV_ITEMS.map(([href, key, icon]) => { const navKey: string = key; const active = isActive(pathname, href); const label = navKey === 'notebook' ? ({ en: 'Notebook', he: 'מחברת', ar: 'مذكرتي', ru: 'Блокнот' } as const)[locale] : navKey === 'examGuide' ? ({ en: 'Exam Guide', he: 'מדריך הבחינה', ar: 'دليل الامتحان', ru: 'Гид по экзамену' } as const)[locale] : messages.nav[navKey as keyof typeof messages.nav]; return <Link key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon}/><span>{label}</span></Link>; })}
      {staff && <Link href="/admin" className={isActive(pathname, '/admin') ? 'active' : undefined} aria-current={isActive(pathname, '/admin') ? 'page' : undefined}><Icon name="shield"/><span>{messages.nav.contentStudio}</span></Link>}
    </nav>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {[NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2], NAV_ITEMS[4], NAV_ITEMS[7]].map(([href, key, icon]) => { const navKey: string = key; const active = isActive(pathname, href); const label = navKey === 'notebook' ? ({ en: 'Notebook', he: 'מחברת', ar: 'مذكرتي', ru: 'Блокнот' } as const)[locale] : navKey === 'examGuide' ? ({ en: 'Exam Guide', he: 'מדריך הבחינה', ar: 'دليل الامتحان', ru: 'Гид по экзамену' } as const)[locale] : messages.nav[navKey as keyof typeof messages.nav]; return <Link key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon} size={18}/><span>{label}</span></Link>; })}
    </nav>
  </>;
}

