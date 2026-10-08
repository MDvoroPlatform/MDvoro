import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthorizationError, requireStaff } from '@/lib/server/authorization';
import { AdminNav } from '@/components/admin/admin-nav';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: {
    children: ReactNode;
}) {
    let context: Awaited<ReturnType<typeof requireStaff>> | null = null;
    try {
        context = await requireStaff();
    }
    catch (error) {
        if (error instanceof AuthorizationError) {
            if (error.code === 'mfa_required')
                redirect('/settings?security=mfa_required');
            if (error.code === 'forbidden')
                redirect('/dashboard');
        }
        redirect('/login');
    }
    if (!context) return null;
    const resolvedContext = context;
    return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/admin" className="brand"><span className="brand-mark">MD</span><span className="brand-name">MD<span>voro</span></span></Link>
      <div className="admin-label">Content Studio</div>
      <AdminNav role={resolvedContext.role}/>
      <div className="sidebar-spacer"/>
      <div className="admin-role"><span>Signed in as</span><strong>{resolvedContext.user.user_metadata?.full_name || resolvedContext.user.email}</strong><small>{resolvedContext.role}</small></div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div><span className="admin-kicker">MDvoro</span><strong>Medical Content Studio</strong></div><Link className="btn" href="/dashboard">Back to app</Link></header>{children}</main>
  </div>;
}

