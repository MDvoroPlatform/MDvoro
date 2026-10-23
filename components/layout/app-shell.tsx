import type { ReactNode } from 'react';
import Link from 'next/link';
import { MobileNavDrawer, PrimaryNav } from '@/components/layout/primary-nav';
import { GlobalQuestionSearch } from '@/components/layout/global-question-search';
import { NotificationBell } from '@/components/layout/notification-bell';
import { getI18n } from '@/lib/i18n/server';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { MDvoroLogo } from '@/components/layout/mdvoro-logo';
import { HomeLogoLink } from '@/components/layout/home-logo-link';
import { MDvoroFooter } from '@/components/layout/mdvoro-footer';
export async function AppShell({ children, userName, role }: {
    children: ReactNode;
    userName?: string | null;
    role?: string | null;
}) {
    const { messages: m } = await getI18n();
    const staff = ['super_admin', 'admin', 'editor', 'reviewer', 'support'].includes(role ?? '');
    return (<div className="shell">
      <aside className="sidebar" aria-label={m.nav.dashboard}>
        <HomeLogoLink className="brand brand-image">
          <MDvoroLogo />
        </HomeLogoLink>
        <PrimaryNav staff={staff}/>
        <div className="sidebar-spacer"/>
        <div className="sidebar-footer">{m.shell.learn}<div className="sidebar-legal-links"><Link href="/legal/privacy">Privacy</Link><Link href="/legal/cookies">Cookies</Link><Link href="/legal/terms">Terms</Link></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-mobile-controls">
            <div className="topbar-mobile-brand">
              <HomeLogoLink className="brand brand-image">
                <MDvoroLogo compact />
              </HomeLogoLink>
            </div>
            <MobileNavDrawer staff={staff} userName={userName}/>
          </div>
          <GlobalQuestionSearch />
          <div className="topbar-tools"><NotificationBell /></div>
          <div className="user-menu">
            <div className="avatar" aria-hidden="true">{(userName?.trim()?.[0] ?? 'S').toUpperCase()}</div>
            <div className="user-copy"><strong>{userName || m.shell.student}</strong><span>{role ?? 'student'}</span></div>
          </div>
        </header>
        <div>{children}</div>
        <MDvoroFooter />
      </main>
      <PresenceHeartbeat />
    </div>);
}

