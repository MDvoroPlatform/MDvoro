'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { MDvoroLogo } from '@/components/layout/mdvoro-logo';
import { useI18n } from '@/components/i18n/provider';

type FooterLink = { href: Route; label: string };
type FooterGroup = { id: string; title: string; links: FooterLink[] };

function FooterGroupView({ group }: { group: FooterGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="mdvoro-footer-group" aria-label={group.title}>
      <h2 className="mdvoro-footer-desktop-heading" id={`footer-${group.id}`}>{group.title}</h2>
      <button className="mdvoro-footer-mobile-heading" type="button" aria-expanded={expanded} aria-controls={`footer-links-${group.id}`} onClick={() => setExpanded(value => !value)}>
        <span>{group.title}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <nav id={`footer-links-${group.id}`} className={`mdvoro-footer-links${expanded ? ' is-expanded' : ''}`} aria-label={group.title}>
        {group.links.map(link => <Link href={link.href} key={link.href}>{link.label}</Link>)}
      </nav>
    </section>
  );
}

export function MDvoroFooter() {
  const { messages: m } = useI18n();
  const groups: FooterGroup[] = [
    { id: 'learning', title: 'LEARNING', links: [
      { href: '/qbank', label: m.nav.qbank },
      { href: '/flashcards', label: m.nav.flashcards },
      { href: '/study-plan', label: m.nav.studyPlan },
      { href: '/analytics', label: m.nav.analytics },
      { href: '/knowledge', label: m.nav.knowledge },
    ] },
    { id: 'workspace', title: 'WORKSPACE', links: [
      { href: '/dashboard', label: m.nav.dashboard },
      { href: '/settings', label: m.nav.settings },
    ] },
    { id: 'legal', title: 'LEGAL & ACCESSIBILITY', links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/cookies', label: 'Cookies' },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/accessibility', label: 'Accessibility' },
      { href: '/legal/copyright', label: 'Copyright' },
      { href: '/legal/dmca', label: 'Copyright notices' },
    ] },
  ];

  return (
    <footer className="mdvoro-footer">
      <div className="mdvoro-footer-main">
        <div className="mdvoro-footer-brand">
          <Link href="/dashboard" aria-label="MDvoro home"><MDvoroLogo /></Link>
        </div>
        <div className="mdvoro-footer-groups">{groups.map(group => <FooterGroupView key={group.id} group={group} />)}</div>
      </div>
      <div className="mdvoro-footer-bottom">
        <p>© {new Date().getFullYear()} MDvoro. All rights reserved.</p>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
