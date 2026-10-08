import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError } from '@/lib/server/api';
export async function GET(){try{const {supabase}=await requireAdmin();const [{data:events,error:e1},{data:notices,error:e2}]=await Promise.all([supabase.rpc('admin_audit_feed',{p_limit:200}),supabase.rpc('admin_list_copyright_notices',{p_limit:100})]);if(e1||e2)return NextResponse.json({error:'audit_failed'},{status:400});return NextResponse.json({events:events??[],notices:notices??[]},{headers:{'Cache-Control':'private,no-store'}});}catch(error){return apiError(error,'audit_failed');}}
