import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

if (!url || !serviceRoleKey || !email) {
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
let page = 1;
let target = null;
while (!target) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  target = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 1000) break;
  page += 1;
}
if (!target) {
  console.error(`No Auth user found for ${email}. Create the account normally first.`);
  process.exit(2);
}

const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', target.id);
if (error) throw error;
console.log(`Provisioned ${email} as admin. Enable MFA on this account before production access.`);
