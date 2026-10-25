import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/server/api';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { data, error } = await supabase.from('lab_values')
      .select('id,name,category,reference_range,unit,si_reference_range,si_unit,population,source_reference')
      .eq('status', 'approved').order('category').order('name').limit(300);
    if (error) throw error;

    return NextResponse.json({ values: data ?? [] }, { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    return apiError(error, 'labs_unavailable');
  }
}
