'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';
import { MDvoroLogo } from '@/components/layout/mdvoro-logo';
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

export function MobileNavDrawer({ staff, userName }: { staff: boolean; userName?: string | null }) {
    const pathname = usePathname();
    return <MobileNavDrawerPanel key={pathname} staff={staff} userName={userName}/>;
}

function MobileNavDrawerPanel({ staff, userName }: { staff: boolean; userName?: string | null }) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const { messages, locale } = useI18n();
    const progressCopy = ({
        en: { small: 'Small steps...', big: 'Big progress' },
        he: { small: 'צעדים קטנים...', big: 'התקדמות גדולה' },
        ar: { small: 'خطوات صغيرة...', big: 'تقدم كبير' },
        ru: { small: 'Маленькие шаги...', big: 'Большой прогресс' },
    } as const)[locale];
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
        <div className="mobile-drawer-heading">
          <Link href="/dashboard" className="mobile-drawer-logo" aria-label="MDvoro home" onClick={() => setOpen(false)}><MDvoroLogo /></Link>
          <button type="button" className="mobile-drawer-close" aria-label="Close navigation menu" onClick={() => setOpen(false)}><Icon name="chevron-left" size={20}/></button>
        </div>
        <Link href="/settings" className="mobile-drawer-profile" onClick={() => setOpen(false)}>
          <span className="mobile-drawer-avatar"><Icon name="user" size={27}/></span>
          <span className="mobile-drawer-profile-copy"><span>{messages.auth.welcome},</span><strong>{userName?.trim() || messages.shell.student}</strong></span>
          <Icon name="chevron-right" size={20}/>
        </Link>
        <nav className="mobile-drawer-nav" aria-label="All pages">
          <div className="nav mobile-drawer-links">
            {NAV_ITEMS.slice(0, 6).map(([href, key, icon]) => <DrawerNavLink key={href} href={href} labelKey={key} icon={icon} onNavigate={() => setOpen(false)}/>)}
            <DrawerNavLink href="/leaderboard" labelKey="leaderboard" icon="trophy" onNavigate={() => setOpen(false)}/>
          </div>
          <div className="mobile-drawer-divider" />
          <div className="nav mobile-drawer-links">
            {NAV_ITEMS.slice(7, 10).map(([href, key, icon]) => <DrawerNavLink key={href} href={href} labelKey={key} icon={icon} onNavigate={() => setOpen(false)}/>)}
          </div>
          <div className="mobile-drawer-divider" />
          <div className="nav mobile-drawer-links">
            <DrawerNavLink href="/settings" labelKey="settings" icon="settings" onNavigate={() => setOpen(false)}/>
            {staff && <Link href="/admin" onClick={() => setOpen(false)} className={isActive(pathname, '/admin') ? 'active' : undefined} aria-current={isActive(pathname, '/admin') ? 'page' : undefined}><span className="mobile-drawer-icon"><Icon name="shield" size={21}/></span><span>{messages.nav.contentStudio}</span><Icon name="chevron-right" size={19}/></Link>}
          </div>
        </nav>
        <div className="mobile-drawer-progress">
          <span className="mobile-drawer-progress-accent" />
          <Icon name="graduation" size={27}/>
          <span className="mobile-drawer-progress-copy"><span>{progressCopy.small}</span><strong>{progressCopy.big}</strong></span>
          <Icon name="trend-up" size={21}/>
        </div>
      </div>
    </div>;
}

function DrawerNavLink({ href, labelKey, icon, onNavigate }: { href: typeof NAV_ITEMS[number][0]; labelKey: string; icon: typeof NAV_ITEMS[number][2] | 'trophy'; onNavigate: () => void }) {
    const pathname = usePathname();
    const { messages, locale } = useI18n();
    const active = isActive(pathname, href);
    const label = labelKey === 'notebook'
        ? ({ en: 'Notebook', he: 'מחברת', ar: 'مذكرتي', ru: 'Блокнот' } as const)[locale]
        : labelKey === 'examGuide'
            ? ({ en: 'Exam Guide', he: 'מדריך הבחינה', ar: 'دليل الامتحان', ru: 'Гид по экзамену' } as const)[locale]
            : labelKey === 'leaderboard'
                ? ({ en: 'Leaderboard', he: 'לוח מובילים', ar: 'لوحة المتصدرين', ru: 'Таблица лидеров' } as const)[locale]
                : messages.nav[labelKey as keyof typeof messages.nav];
    return <Link href={href} onClick={onNavigate} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
      <span className="mobile-drawer-icon"><Icon name={icon} size={21}/></span><span>{label}</span><Icon name="chevron-right" size={19}/>
    </Link>;
}

