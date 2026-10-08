import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
export const dynamic = 'force-dynamic';
export default async function ProtectedLayout({ children }: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        redirect('/login');
    const { data: profile } = await supabase.from('profiles').select('full_name,role,active_exam_id,account_status').eq('id', user.id).maybeSingle();
    if (profile?.account_status === 'suspended') redirect('/account-suspended');
    const { data: exam } = profile?.active_exam_id ? await supabase.from('exams').select('code,name').eq('id', profile.active_exam_id).maybeSingle() : { data: null };
    return <AppShell userName={profile?.full_name ?? user.email} role={profile?.role} examLabel={exam?.code ?? 'Choose exam'}>{children}</AppShell>;
}

