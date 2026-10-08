import { requireAdmin } from '@/lib/server/authorization';
import { TeamRoleEditor } from '@/components/admin/team-role-editor';
export default async function TeamPage() {
    const { user, supabase, role } = await requireAdmin();
    const { data: users } = await supabase.rpc('admin_list_users', { p_search: null, p_limit: 500, p_offset: 0 });
    const teamUsers = (users ?? []) as unknown as Array<{ id: string; full_name: string | null; email: string | null; role: string }>;
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Identity & access</div><h1>Team</h1><p className="subtitle">Assign the minimum role required. The database blocks self-demotion and protects the last administrator.</p></div></div>
    <section className="card card-pad security-note">Admin accounts should use a separate account from everyday student activity and must have MFA enabled before production access is granted.</section>
    <section className="card admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Current role</th><th>Created</th><th>Change</th></tr></thead><tbody>{teamUsers.map((u) => <TeamRoleEditor key={u.id} userId={u.id} name={u.full_name || u.email || u.id} role={u.role} currentUserId={user.id} canGrantSuperAdmin={role === 'super_admin'}/>)}</tbody></table></section>
  </div>;
}

