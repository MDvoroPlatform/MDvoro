import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { ExamSelector } from '@/components/account/exam-selector';
import { getI18n } from '@/lib/i18n/server';
import { DeleteAccountButton } from '@/components/account/delete-account-button';
import { LeaderboardPrivacy } from '@/components/account/leaderboard-privacy';
import { AdminMfaSetup } from '@/components/account/admin-mfa-setup';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { ThemeToggle } from '@/components/i18n/theme-toggle';

export default async function SettingsPage() {
    const { messages: m } = await getI18n();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: profile }, { data: exams }] = await Promise.all([
        supabase.from('profiles').select('full_name,role,active_exam_id,leaderboard_visible').eq('id', user.id).maybeSingle(),
        supabase.from('exams').select('id,code,name').order('name'),
    ]);

    return <div className="page">
      <div className="page-head"><div><div className="eyebrow">{m.settings.eyebrow}</div><h1>{m.settings.title}</h1><p className="subtitle">{m.settings.subtitle}</p></div></div>
      <div className="grid grid-3 settings-preferences-grid">
        <section className="card card-pad settings-preference-card">
          <div className="kicker">{m.settings.identity}</div><h2 className="section-heading">{m.settings.profile}</h2>
          <div className="settings-profile">
            <span className="avatar" aria-hidden="true">{(profile?.full_name?.trim()?.[0] ?? user.email?.trim()?.[0] ?? 'S').toUpperCase()}</span>
            <div><strong>{profile?.full_name || m.settings.nameNotSet}</strong><p className="panel-sub">{user.email}</p><p className="panel-sub">{m.settings.role}: {profile?.role ?? 'student'}</p></div>
          </div>
        </section>
        <section className="card card-pad settings-preference-card"><div className="kicker">{m.settings.exam}</div><h2 className="section-heading">{m.settings.activeExam}</h2><ExamSelector exams={exams ?? []} current={profile?.active_exam_id ?? null}/></section>
        <section className="card card-pad settings-preference-card"><div className="kicker">{m.settings.preferences}</div><h2 className="section-heading">{m.settings.language}</h2><p className="panel-sub">{m.settings.languageHelp}</p><LocaleSwitcher /></section>
        <section className="card card-pad settings-preference-card"><div className="kicker">{m.settings.preferences}</div><h2 className="section-heading">{m.settings.appearance}</h2><p className="panel-sub">{m.settings.appearanceHelp}</p><div className="settings-appearance-control"><span>{m.settings.darkMode}</span><ThemeToggle /></div></section>
        <section className="card card-pad settings-preference-card"><div className="kicker">{m.settings.session}</div><h2 className="section-heading">{m.settings.signOut}</h2><p className="panel-sub field-note-bottom">{m.settings.endSession}</p><SignOutButton /></section>
      </div>
      {profile?.role === 'admin' || profile?.role === 'super_admin' ? <div className="settings-danger-card"><AdminMfaSetup /></div> : null}
      <section className="card card-pad settings-danger-card"><div className="kicker">Privacy</div><h2 className="section-heading">Account deletion</h2><p className="panel-sub">Permanently remove your account and associated learning records.</p><DeleteAccountButton /></section>
    </div>;
}
