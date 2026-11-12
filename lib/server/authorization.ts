import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
export const STAFF_ROLES = ['admin', 'editor', 'reviewer', 'support'] as const;
export const CONTENT_EDITOR_ROLES = ['admin', 'editor'] as const;
export const CONTENT_REVIEWER_ROLES = ['admin', 'reviewer'] as const;
export const ADMIN_ROLES = ['admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type AuthorizedContext = {
    user: User;
    role: string;
    supabase: SupabaseClient;
};
export async function getAuthorizedContext(): Promise<AuthorizedContext | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile)
        return null;
    return { user, role: profile.role === 'super_admin' ? 'admin' : profile.role, supabase };
}
export async function requireRole(allowed: readonly string[]): Promise<AuthorizedContext> {
    const context = await getAuthorizedContext();
    if (!context)
        throw new AuthorizationError('unauthorized');
    if (!allowed.includes(context.role))
        throw new AuthorizationError('forbidden');
    if (context.role === 'admin') {
        const { data, error } = await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error || data.currentLevel !== 'aal2')
            throw new AuthorizationError('mfa_required');
    }
    return context;
}
export class AuthorizationError extends Error {
    constructor(public readonly code: 'unauthorized' | 'forbidden' | 'mfa_required') { super(code); this.name = 'AuthorizationError'; }
}
export const requireStaff = () => requireRole(STAFF_ROLES);
export const requireContentEditor = () => requireRole(CONTENT_EDITOR_ROLES);
export const requireContentReviewer = () => requireRole(CONTENT_REVIEWER_ROLES);
export const requireAdmin = () => requireRole(ADMIN_ROLES);
