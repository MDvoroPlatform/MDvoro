import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/authorization';
import { apiError } from '@/lib/server/api';

export async function GET(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  try {
    const { questionId } = await params;
    const { role, supabase } = await requireStaff();
    if (role === 'support') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const { data, error } = await supabase.rpc('admin_list_question_versions', { p_question_id: questionId });
    if (error) return NextResponse.json({ error: 'versions_load_failed' }, { status: 400 });
    return NextResponse.json({ versions: data ?? [] }, { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    return apiError(error, 'versions_load_failed');
  }
}
