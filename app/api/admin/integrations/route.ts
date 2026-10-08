import { NextResponse } from 'next/server';
import { requireContentEditor } from '@/lib/server/authorization';
import { apiError } from '@/lib/server/api';
import { aiIntegrationStatus } from '@/lib/ai/provider';
export async function GET() {
    try {
        await requireContentEditor();
        return NextResponse.json({ ai: aiIntegrationStatus() }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        return apiError(error, 'integration_status_failed');
    }
}

