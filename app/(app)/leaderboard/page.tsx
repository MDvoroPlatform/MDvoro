import { createClient } from '@/lib/supabase/server';
import { Leaderboard } from '@/components/leaderboard/leaderboard';

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: exams }] = await Promise.all([
    supabase.from('profiles').select('active_exam_id,leaderboard_visible').eq('id', user.id).maybeSingle(),
    supabase.from('exams').select('id,code,name').order('name')
  ]);
  const activeExam = exams?.find((e) => e.id === profile?.active_exam_id) ?? exams?.[0] ?? null;
  const [{ data: rows }, { data: visibility }] = await Promise.all([
    activeExam ? supabase.rpc('public_leaderboard', { p_exam_id: activeExam.id, p_period: 'week', p_metric: 'questions', p_limit: 50 }) : Promise.resolve({ data: [] }),
    supabase.rpc('my_leaderboard_visibility')
  ]);
  return <Leaderboard exam={activeExam} initialRows={rows ?? []} initialVisible={visibility ?? profile?.leaderboard_visible ?? true} />;
}
