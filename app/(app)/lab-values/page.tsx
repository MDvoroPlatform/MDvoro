import { createClient } from '@/lib/supabase/server';
import { getI18n } from '@/lib/i18n/server';
import { LabValuesBrowser, type LabValueRow } from '@/components/library/lab-values-browser';

export default async function LabValuesPage() {
  const [{ locale }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('lab_values').select('id,name,category,reference_range,unit,si_reference_range,si_unit,population,source_reference').eq('status','approved').order('category').order('name').limit(300);
  const title = { en: ['Clinical reference','Lab Values','Browse reviewed reference ranges in conventional and SI units.'], he: ['מידע קליני','ערכי מעבדה','טווחי ייחוס שנבדקו ביחידות רגילות וביחידות SI.'], ar: ['مرجع سريري','القيم المخبرية','تصفّح القيم المرجعية المعتمدة بالوحدات التقليدية ووحدات SI.'], ru: ['Клинический справочник','Лабораторные показатели','Проверенные референсные диапазоны в обычных единицах и СИ.'] } as const;
  const copy = title[locale];
  return <div className="page"><div className="page-head"><div><div className="eyebrow">{copy[0]}</div><h1>{copy[1]}</h1><p className="subtitle">{copy[2]}</p></div></div><LabValuesBrowser values={(data ?? []) as LabValueRow[]}/></div>;
}
