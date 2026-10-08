import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, noStoreJson } from '@/lib/server/api';
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        const { data, error } = await supabase.rpc('smart_student_snapshot');
        if (error)
            return NextResponse.json({ error: 'smart_snapshot_unavailable' }, { status: 500 });
        return noStoreJson(data ?? {});
    }
    catch (error) {
        return apiError(error, 'smart_snapshot_unavailable');
    }
}

