'use client';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/provider';
export function SignOutButton() { const { messages: m } = useI18n(); async function signOut() { const supabase = createClient(); await supabase.auth.signOut(); window.location.assign('/login'); } return <button className="btn btn-danger" onClick={signOut}>{m.settings.signOut}</button>; }

