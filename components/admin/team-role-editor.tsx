'use client';
import { useState } from 'react';
import { ROLE_HELP, ROLE_LABELS, type Role } from '@/lib/content/roles';
export function TeamRoleEditor({ userId, name, role, currentUserId, canGrantSuperAdmin = false }: {
    userId: string;
    name: string;
    role: string;
    currentUserId: string;
    canGrantSuperAdmin?: boolean;
}) {
    const [value, setValue] = useState<Role>((role in ROLE_LABELS ? role : 'student') as Role);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        setMessage('');
        const response = await fetch('/api/admin/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role: value }) });
        const body = await response.json().catch(() => ({}));
        setMessage(response.ok ? 'Saved' : body.error === 'last_admin_protected' ? 'Last admin protected' : 'Failed');
        setBusy(false);
    }
    return <tr><td><div className="table-title">{name}</div><small>{userId}</small></td><td><span className="status status-published">{ROLE_LABELS[value]}</span></td><td>—</td><td><div className="role-editor"><select value={value} disabled={userId === currentUserId} onChange={(e) => setValue(e.target.value as Role)}>{(Object.keys(ROLE_LABELS) as Role[]).filter((item) => item !== 'super_admin' || canGrantSuperAdmin).map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select><small>{ROLE_HELP[value]}</small><button className="btn" disabled={busy || value === role || userId === currentUserId} onClick={save}>{busy ? 'Saving…' : 'Apply'}</button>{message && <small>{message}</small>}</div></td></tr>;
}

