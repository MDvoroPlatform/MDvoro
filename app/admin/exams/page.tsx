import { requireSuperAdmin } from '@/lib/server/authorization';
import { ExamProfileEditor } from '@/components/admin/exam-profile-editor';

type ExamProfile = {
  total_duration_minutes: number;
  official_max_items: number;
  product_max_items: number;
  block_duration_minutes: number;
  block_max_items: number;
  block_count: number;
  break_minutes: number;
  previous_block_review_allowed: boolean;
  enabled: boolean;
  timing_verified: boolean;
  timing_source: string;
  timing_notes: string | null;
};

type ExamRow = { id: string; code: string; name: string; description: string | null; profile: ExamProfile | null };

export default async function AdminExamsPage() {
  const { supabase } = await requireSuperAdmin();
  const { data: exams } = await supabase.from('exams').select('id,code,name,description').order('name');
  const rows: ExamRow[] = [];
  for (const exam of exams ?? []) {
    const { data } = await supabase.rpc('admin_exam_profile', { p_exam_id: exam.id });
    rows.push({ ...exam, profile: (data?.[0] as ExamProfile | undefined) ?? null });
  }
  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Super administrator</div>
          <h1>Exam profiles</h1>
          <p className="subtitle">Change exam timing and delivery rules without changing application code.</p>
        </div>
      </div>
      <div className="grid grid-2">{rows.map((row) => <ExamProfileEditor key={row.id} exam={row} />)}</div>
    </div>
  );
}

