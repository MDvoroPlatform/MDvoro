import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { noStoreJson, apiError } from '@/lib/server/api';
import { z } from 'zod';
const schema = z.object({ examId: z.string().uuid() });
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { examId } = schema.parse({ examId: url.searchParams.get('examId') });
    const supabase = await createClient();
    const { data:{user} } = await supabase.auth.getUser();
    if (!user) return noStoreJson({error:'unauthorized'}, {status:401});
    const { data, error } = await supabase.rpc('qbank_catalog', { p_exam_id: examId });
    if (error) return noStoreJson({error:'catalog_failed'}, {status:400});
    return noStoreJson(data ?? null);
  } catch (error) { return apiError(error,'catalog_failed'); }
}
