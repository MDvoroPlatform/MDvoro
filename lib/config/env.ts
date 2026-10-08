import { z } from 'zod';

const publicEnv = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export function getPublicEnv() {
    return publicEnv.parse({
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
}

export function validateProductionEnv() {
    if (process.env.NODE_ENV !== 'production') return;
    const required = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'NEXT_PUBLIC_SITE_URL',
        'MDVORO_APP_ORIGIN',
        'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
            ] as const;
    const missing = required.filter((name) => !process.env[name]?.trim());
    if (missing.length) {
        throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
    const siteValue = process.env.NEXT_PUBLIC_SITE_URL;
    const originValue = process.env.MDVORO_APP_ORIGIN;
    if (!siteValue || !originValue) {
        throw new Error('Production origin configuration is invalid.');
    }
    let site: URL;
    let origin: URL;
    try {
        site = new URL(siteValue);
        origin = new URL(originValue);
    } catch {
        throw new Error('Production origin configuration is invalid.');
    }
    if (site.origin !== origin.origin) throw new Error('NEXT_PUBLIC_SITE_URL and MDVORO_APP_ORIGIN must have the same origin.');
    if (origin.protocol !== 'https:') throw new Error('MDVORO_APP_ORIGIN must use HTTPS in production.');
}
