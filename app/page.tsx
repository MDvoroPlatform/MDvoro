import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_public_site_status');
  if (data?.[0]?.under_construction) redirect('/under-construction');
  redirect('/dashboard');
}
