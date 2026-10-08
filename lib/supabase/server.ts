import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicEnv, validateProductionEnv } from '@/lib/config/env';
export async function createClient() {
    validateProductionEnv();
    const cookieStore = await cookies();
    const env = getPublicEnv();
    return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                }
                catch { /* Server Components may not permit cookie writes. The proxy owns refresh. */ }
            },
        },
    });
}

