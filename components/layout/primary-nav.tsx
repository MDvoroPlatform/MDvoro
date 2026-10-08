'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
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
function NavLinks({ staff, closeOnNavigate = false }: { staff: boolean; closeOnNavigate?: boolean }) {
    const pathname = usePathname();
    const { messages, locale } = useI18n();
    const labelFor = (key: string) => key === 'notebook'
        ? ({ en: 'Notebook', he: 'מחברת', ar: 'مذكرتي', ru: 'Блокнот' } as const)[locale]
        : key === 'examGuide'
            ? ({ en: 'Exam Guide', he: 'מדריך הבחינה', ar: 'دليل الامتحان', ru: 'Гид по экзамену' } as const)[locale]
            : messages.nav[key as keyof typeof messages.nav];
    const close = (event: MouseEvent<HTMLAnchorElement>) => {
        if (closeOnNavigate) event.currentTarget.closest('details')?.removeAttribute('open');
    };
    return <>
      {NAV_ITEMS.map(([href, key, icon]) => {
          const active = isActive(pathname, href);
          return <Link key={href} href={href} onClick={close} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon}/><span>{labelFor(key)}</span></Link>;
      })}
      {staff && <Link href="/admin" onClick={close} className={isActive(pathname, '/admin') ? 'active' : undefined} aria-current={isActive(pathname, '/admin') ? 'page' : undefined}><Icon name="shield"/><span>{messages.nav.contentStudio}</span></Link>}
    </>;
}
export function PrimaryNav({ staff }: {
    staff: boolean;
}) {
    return <>
    <nav className="nav" aria-label="Primary navigation">
      <NavLinks staff={staff}/>
    </nav>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <MobileNavItems/>
    </nav>
  </>;
}

function MobileNavItems() {
    const pathname = usePathname();
    const { messages, locale } = useI18n();
    return <>
      {[NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2], NAV_ITEMS[4], NAV_ITEMS[7]].map(([href, key, icon]) => {
          const label = key === 'examGuide'
              ? ({ en: 'Exam Guide', he: 'מדריך הבחינה', ar: 'دليل الامتحان', ru: 'Гид по экзамену' } as const)[locale]
              : messages.nav[key as keyof typeof messages.nav];
          const active = isActive(pathname, href);
          return <Link key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon} size={18}/><span>{label}</span></Link>;
      })}
    </>;
}

export function MobileNavDrawer({ staff }: { staff: boolean }) {
    return <details className="mobile-drawer">
      <summary aria-label="Open navigation menu"><Icon name="menu" size={20}/></summary>
      <button type="button" className="mobile-drawer-backdrop" aria-label="Close navigation menu" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}/>
      <nav className="mobile-drawer-panel" aria-label="All pages">
        <div className="mobile-drawer-heading"><strong>MDvoro</strong><span>Learn. Practice. Excel.</span></div>
        <div className="nav mobile-drawer-links"><NavLinks staff closeOnNavigate/></div>
      </nav>
    </details>;
}

