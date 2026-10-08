'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { Icon } from '@/components/ui/icons';
type NavItem = {
    href: Route;
    label: string;
    icon: Parameters<typeof Icon>[0]['name'];
    adminOnly?: boolean;
    systemOnly?: boolean;
    reviewerOnly?: boolean;
};
const items: readonly NavItem[] = [
    { href: '/admin', label: 'Overview', icon: 'grid' },
    { href: '/admin/questions', label: 'Questions', icon: 'book' },
    { href: '/admin/questions/new', label: 'New question', icon: 'plus' },
    { href: '/admin/review', label: 'Review queue', icon: 'check', reviewerOnly: true },
    { href: '/admin/media', label: 'Media library', icon: 'cards' },
    { href: '/admin/import', label: 'Import', icon: 'arrow' },
    { href: '/admin/taxonomy', label: 'Taxonomy', icon: 'grid' },
    { href: '/admin/knowledge', label: 'Knowledge', icon: 'book' },
    { href: '/admin/team', label: 'Team', icon: 'shield', adminOnly: true },
    { href: '/admin/integrations', label: 'Integrations', icon: 'settings' },
    { href: '/admin/users', label: 'Users & access', icon: 'shield', adminOnly: true },
    { href: '/admin/revenue', label: 'Revenue', icon: 'chart', adminOnly: true },
    { href: '/admin/audit', label: 'Audit & copyright', icon: 'shield', adminOnly: true },
    { href: '/admin/system', label: 'System', icon: 'settings', systemOnly: true },
    { href: '/admin/exams', label: 'Exam profiles', icon: 'calendar', systemOnly: true },
] as const;
export function AdminNav({ role }: {
    role: string;
}) {
    const pathname = usePathname();
    return (<nav className="admin-nav" aria-label="Content Studio">
      {items.filter((item) => (!item.adminOnly || role === 'admin' || role === 'super_admin') && (!item.systemOnly || role === 'super_admin') && (!item.reviewerOnly || role === 'super_admin' || role === 'admin' || role === 'reviewer')).map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (<Link key={item.href} href={item.href} className={active ? 'active' : undefined}>
            <Icon name={item.icon} size={17}/>
            <span>{item.label}</span>
          </Link>);
        })}
      <Link href="/settings"><Icon name="settings" size={17}/><span>Account</span></Link>
    </nav>);
}

