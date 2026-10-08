import { createClient } from '@/lib/supabase/server';
import { AdaptivePlan } from '@/components/study-plan/adaptive-plan';
import { getI18n } from '@/lib/i18n/server';
export default async function StudyPlanPage() { const { messages: m } = await getI18n(); const s = await createClient(); const { data: { user } } = await s.auth.getUser(); if (!user)
    return null; const [{ data: profile }, { data: exams }] = await Promise.all([s.from('profiles').select('active_exam_id').eq('id', user.id).maybeSingle(), s.from('exams').select('id,name').order('name')]); return <div className="page"><div className="page-head"><div><div className="eyebrow">{m.studyPlan.eyebrow}</div><h1>{m.studyPlan.title}</h1><p className="subtitle">{m.studyPlan.subtitle}</p></div></div><AdaptivePlan exams={exams ?? []} currentExamId={profile?.active_exam_id ?? null}/></div>; }

