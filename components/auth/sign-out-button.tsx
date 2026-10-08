'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/provider';
export function SignOutButton() { const { messages: m } = useI18n(); const router = useRouter(); async function signOut() { const supabase = createClient(); await supabase.auth.signOut(); router.replace('/login'); router.refresh(); } return <button className="btn btn-danger" onClick={signOut}>{m.settings.signOut}</button>; }

