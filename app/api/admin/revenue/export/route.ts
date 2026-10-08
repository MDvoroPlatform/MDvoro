import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError } from '@/lib/server/api';

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const month = new URL(request.url).searchParams.get('month');
    const parsed = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null;
    const { data, error } = parsed
      ? await supabase.rpc('admin_monthly_revenue', { p_month: parsed })
      : await supabase.rpc('admin_monthly_revenue');
    if (error) return NextResponse.json({ error: 'export_failed' }, { status: 400 });

    const rows = [
      ['date', 'provider', 'kind', 'status', 'currency', 'amount_minor', 'transaction_id'],
      ...(data ?? []).map((row: { day: string; provider: string; kind: string; status: string; currency: string; amount_minor: number; transaction_id: string }) => [
        row.day,
        row.provider,
        row.kind,
        row.status,
        row.currency,
        String(row.amount_minor),
        row.transaction_id,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const filenameMonth = month ?? 'current';
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mdvoro-revenue-${filenameMonth}.csv"`,
        'Cache-Control': 'private,no-store',
      },
    });
  } catch (error) {
    return apiError(error, 'export_failed');
  }
}
