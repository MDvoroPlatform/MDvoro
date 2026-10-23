import { requireAdmin } from '@/lib/server/authorization';
import { UserControls } from '@/components/admin/user-controls';
import { CreateUserForm } from '@/components/admin/create-user-form';
import { AnnouncementComposer } from '@/components/admin/announcement-composer';

type UserAccessRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  account_status: string;
  created_at: string;
  last_seen_at: string | null;
  subscription_active: boolean;
  subscription_until: string | null;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user, supabase } = await requireAdmin();
  const { q } = await searchParams;
  const { data: users, error } = await supabase.rpc('admin_list_user_access', {
    p_search: q?.trim().slice(0, 120) || null,
    p_limit: 200,
    p_offset: 0,
  });

  return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Identity & lifecycle</div><h1>Users & access</h1><p className="subtitle">Manage accounts, passwords, manual premium access and account status. Administrative changes are recorded in the audit log.</p></div></div>
    <CreateUserForm/>
    <AnnouncementComposer />
    <section className="card card-pad admin-filters"><form className="admin-filter-form"><input name="q" defaultValue={q ?? ''} placeholder="Search by name or email…"/><button className="btn btn-primary" type="submit">Search users</button>{q && <a className="btn" href="/admin/users">Clear</a>}</form></section>
    <section className="card admin-table-wrap"><table className="admin-table">
      <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Premium access</th><th>Created</th><th>Last seen</th><th>Actions</th></tr></thead>
      <tbody>
        {error ? <tr><td colSpan={7}>Could not load users. Apply the latest database migrations and try again.</td></tr> : (users ?? []).map((u: UserAccessRow) => <tr key={u.id}>
          <td><div className="table-title">{u.full_name || 'Unnamed user'}</div><small>{u.email || u.id}</small></td>
          <td><span className="status status-published">{u.role}</span></td>
          <td><span className={`status ${u.account_status === 'active' ? 'status-published' : 'status-draft'}`}>{u.account_status}</span></td>
          <td>{u.subscription_active ? u.subscription_until ? `Through ${new Date(u.subscription_until).toLocaleDateString()}` : 'Active' : 'None'}</td>
          <td>{new Date(u.created_at).toLocaleDateString()}</td>
          <td>{u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : '—'}</td>
          <td><UserControls userId={u.id} status={u.account_status} currentUserId={user.id} canManageUsers/></td>
        </tr>)}
      </tbody>
    </table></section>
  </div>;
}
