import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, noStoreJson } from '@/lib/server/api';

const schema = z.object({ examId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { examId } = schema.parse({ examId: url.searchParams.get('examId') });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return noStoreJson({ error: 'unauthorized' }, { status: 401 });
    const { data, error } = await supabase.rpc('qbank_reconstruction_years', { p_exam_id: examId });
    if (error) return noStoreJson({ error: 'reconstruction_years_failed' }, { status: 400 });
    return noStoreJson(data ?? []);
  } catch (error) {
    return apiError(error, 'reconstruction_years_failed');
  }
}
