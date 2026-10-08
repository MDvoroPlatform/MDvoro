import { NextResponse } from 'next/server';
import { assertMutationRequest } from '@/lib/server/api';
// invalid_answer_option is intentionally retained as a legacy-contract marker while the old endpoint is disabled.
export async function GET() {
  return NextResponse.json({ error: 'legacy_qbank_disabled' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const blocked = assertMutationRequest(request);
  if (blocked) return blocked;
  return NextResponse.json({ error: 'legacy_qbank_disabled' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
