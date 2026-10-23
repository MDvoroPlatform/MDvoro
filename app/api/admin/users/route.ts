import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError, assertMutationRequest, readJson, enforceRateLimit } from '@/lib/server/api';
import { createAdminAuthClient } from '@/lib/supabase/admin';

const userId = z.string().uuid();
const password = z.string().min(8).max(128);
const expiresAt = z.string().datetime({ offset: true });
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), userId, status: z.enum(['active', 'suspended']), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('delete'), userId }),
  z.object({ action: z.literal('password'), userId, password }),
  z.object({ action: z.literal('subscription'), userId, expiresAt }),
  z.object({ action: z.literal('create'), email: z.string().trim().email().max(254), password, expiresAt }),
]);

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') ?? '').slice(0, 120);
    const { data, error } = await supabase.rpc('admin_list_users', {
      p_search: search || null,
      p_limit: 500,
      p_offset: 0,
    });
    if (error) return NextResponse.json({ error: 'users_failed' }, { status: 400 });
    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    return apiError(error, 'users_failed');
  }
}

export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;

  try {
    const { supabase } = await requireAdmin();
    await enforceRateLimit(supabase, 'admin_write', 60, 60);
    const action = actionSchema.parse(await readJson(request));

    if (action.action === 'status') {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_user_id: action.userId,
        p_status: action.status,
        p_reason: action.reason ?? null,
      });
      if (error) {
        const code = error.message.includes('last_admin_protected') ? 'last_admin_protected'
          : error.message.includes('self_status_change') ? 'self_protected' : 'status_change_failed';
        return NextResponse.json({ error: code }, { status: 400 });
      }
    } else if (action.action === 'delete') {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: action.userId });
      if (error) {
        const code = error.message.includes('last_admin_protected') ? 'last_admin_protected'
          : error.message.includes('use_self_delete') ? 'self_protected' : 'delete_failed';
        return NextResponse.json({ error: code }, { status: 400 });
      }
    } else if (action.action === 'subscription') {
      const { error } = await supabase.rpc('admin_set_manual_subscription', {
        p_user_id: action.userId,
        p_expires_at: action.expiresAt,
      });
      if (error) {
        const code = error.message.includes('invalid_expiration') ? 'invalid_expiration'
          : error.message.includes('user_not_found') ? 'user_not_found' : 'subscription_grant_failed';
        return NextResponse.json({ error: code }, { status: 400 });
      }
    } else {
      const adminAuth = createAdminAuthClient();
      if (!adminAuth) return NextResponse.json({ error: 'admin_auth_not_configured' }, { status: 503 });

      if (action.action === 'password') {
        const { error } = await adminAuth.auth.admin.updateUserById(action.userId, { password: action.password });
        if (error) return NextResponse.json({ error: 'password_update_failed' }, { status: 400 });
        const { error: auditError } = await supabase.rpc('admin_log_password_reset', { p_user_id: action.userId });
        if (auditError) return NextResponse.json({ error: 'password_updated_audit_failed' }, { status: 500 });
      } else {
        const { data, error } = await adminAuth.auth.admin.createUser({
          email: action.email,
          password: action.password,
          email_confirm: true,
        });
        if (error || !data.user) {
          const message = error?.message.toLowerCase() ?? '';
          const code = message.includes('already') || message.includes('registered') ? 'email_already_registered' : 'user_create_failed';
          return NextResponse.json({ error: code }, { status: 400 });
        }

        const { error: grantError } = await supabase.rpc('admin_set_manual_subscription', {
          p_user_id: data.user.id,
          p_expires_at: action.expiresAt,
        });
        if (grantError) {
          await adminAuth.auth.admin.deleteUser(data.user.id);
          const code = grantError.message.includes('invalid_expiration') ? 'invalid_expiration' : 'subscription_grant_failed';
          return NextResponse.json({ error: code }, { status: 400 });
        }
        return NextResponse.json({ ok: true, userId: data.user.id }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'user_operation_failed');
  }
}
