import { requireContentReviewer } from '@/lib/server/authorization';
import { AdminLabValues } from '@/components/admin/admin-lab-values';

export default async function AdminLabValuesPage() {
  const { supabase } = await requireContentReviewer();
  const { data, error } = await supabase.rpc('admin_list_lab_values', { p_status: 'all' });
  return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Clinical reference library</div><h1>Lab Values</h1><p className="subtitle">Add values with a source and review them before students can see them. Nothing is prefilled.</p></div></div>
    {error ? <section className="card card-pad"><p className="form-message error">Could not load lab values.</p></section> : <AdminLabValues initialValues={(data ?? []) as never[]}/>}
  </div>;
}
