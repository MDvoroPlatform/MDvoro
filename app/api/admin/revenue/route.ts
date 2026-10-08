import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/authorization';
import { apiError } from '@/lib/server/api';
export async function GET(){try{const {supabase}=await requireAdmin();const {data,error}=await supabase.rpc('admin_platform_metrics');if(error)return NextResponse.json({error:'metrics_failed'},{status:400});return NextResponse.json(data??{}, {headers:{'Cache-Control':'private,no-store'}});}catch(error){return apiError(error,'metrics_failed');}}
