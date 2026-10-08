import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icons';
import { PrimaryNav } from '@/components/layout/primary-nav';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { ThemeToggle } from '@/components/i18n/theme-toggle';
import { getI18n } from '@/lib/i18n/server';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { MDvoroLogo } from '@/components/layout/mdvoro-logo';
export async function AppShell({ children, userName, role, examLabel }: {
    children: ReactNode;
    userName?: string | null;
    role?: string | null;
    examLabel?: string | null;
}) {
    const { messages: m } = await getI18n();
    const staff = ['super_admin', 'admin', 'editor', 'reviewer', 'support'].includes(role ?? '');
    return (<div className="shell">
      <aside className="sidebar" aria-label={m.nav.dashboard}>
        <Link href="/dashboard" className="brand brand-image" aria-label="MDvoro home">
          <MDvoroLogo />
        </Link>
        <PrimaryNav staff={staff}/>
        <div className="sidebar-spacer"/>
        <div className="sidebar-footer">{m.shell.learn}<br />{m.shell.serious}<div className="sidebar-legal-links"><Link href="/legal/privacy">Privacy</Link><Link href="/legal/cookies">Cookies</Link><Link href="/legal/terms">Terms</Link></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-mobile-brand">
            <Link href="/dashboard" className="brand brand-image" aria-label="MDvoro home">
              <MDvoroLogo compact />
            </Link>
          </div>
          <div className="topbar-search">
            <label className="search" aria-label={m.common.search}>
              <Icon name="search" size={15}/>
              <input aria-label={m.common.search} placeholder={m.library.searchPlaceholder} onKeyDown={undefined} />
              <span className="search-shortcut">⌘ K</span>
            </label>
          </div>
          <div className="exam-select">
            <span className="exam-icon"><Icon name="book" size={15}/></span>
            <span>{examLabel ?? m.shell.chooseExam}</span>
          </div>
          <div className="topbar-center">
            <span className="topbar-status-dot" aria-hidden="true"/>
            <span>{m.shell.secure}</span>
          </div>
          <div className="topbar-tools"><LocaleSwitcher /><ThemeToggle /></div>
          <div className="user-menu">
            <div className="avatar" aria-hidden="true">{(userName?.trim()?.[0] ?? 'S').toUpperCase()}</div>
            <div className="user-copy"><strong>{userName || m.shell.student}</strong><span>{role ?? 'student'}</span></div>
          </div>
        </header>
        <div>{children}</div>
      </main>
      <PresenceHeartbeat />
    </div>);
}

