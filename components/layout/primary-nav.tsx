'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
function NavLinks({ staff, onNavigate }: { staff: boolean; onNavigate?: () => void }) {
    const pathname = usePathname();
    const { messages, locale } = useI18n();
    const labelFor = (key: string) => key === 'notebook'
        ? ({ en: 'Notebook', he: 'מחברת', ar: 'مذكرتي', ru: 'Блокнот' } as const)[locale]
        : key === 'examGuide'
            ? ({ en: 'Exam Guide', he: 'מדריך הבחינה', ar: 'دليل الامتحان', ru: 'Гид по экзамену' } as const)[locale]
            : messages.nav[key as keyof typeof messages.nav];
    return <>
      {NAV_ITEMS.map(([href, key, icon]) => {
          const active = isActive(pathname, href);
          return <Link key={href} href={href} onClick={onNavigate} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon}/><span>{labelFor(key)}</span></Link>;
      })}
      {staff && <Link href="/admin" onClick={onNavigate} className={isActive(pathname, '/admin') ? 'active' : undefined} aria-current={isActive(pathname, '/admin') ? 'page' : undefined}><Icon name="shield"/><span>{messages.nav.contentStudio}</span></Link>}
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
    const pathname = usePathname();
    return <MobileNavDrawerPanel key={pathname} staff={staff}/>;
}

function MobileNavDrawerPanel({ staff }: { staff: boolean }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return <div className={`mobile-drawer${open ? ' is-open' : ''}`}>
      <button type="button" className="mobile-menu-button" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open} aria-controls="mobile-navigation-panel" onClick={() => setOpen(value => !value)}><Icon name="menu" size={25}/></button>
      <button type="button" className="mobile-drawer-backdrop" aria-label="Close navigation menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <div id="mobile-navigation-panel" className="mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu" aria-hidden={!open} inert={!open}>
        <div className="mobile-drawer-heading"><strong>MDvoro</strong><span>Learn. Practice. Excel.</span></div>
        <nav className="nav mobile-drawer-links" aria-label="All pages"><NavLinks staff onNavigate={() => setOpen(false)}/></nav>
      </div>
    </div>;
}

