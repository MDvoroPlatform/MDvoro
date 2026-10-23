import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getI18n } from '@/lib/i18n/server';
import { I18nProvider } from '@/components/i18n/provider';
import { CookieConsent } from '@/components/privacy/cookie-consent';
import Script from 'next/script';
export const metadata: Metadata = {
    title: 'MDvoro — Medical Learning Intelligence',
    description: 'A production-grade medical education platform for deliberate practice, retention and exam readiness.',
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
            { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        ],
        apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    manifest: '/manifest.json',
};
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};
export default async function RootLayout({ children }: Readonly<{
    children: ReactNode;
}>) {
    const { locale, dir } = await getI18n();
    return <html lang={locale} dir={dir} suppressHydrationWarning><body><Script id="mdvoro-theme-init" strategy="beforeInteractive">{`(function(){try{var saved=localStorage.getItem('mdvoro_theme');var theme=saved==='dark'?'dark':'light';var root=document.documentElement;root.dataset.theme=theme;root.classList.toggle('dark',theme==='dark');if(saved==='system')localStorage.setItem('mdvoro_theme','light')}catch(_){document.documentElement.dataset.theme='light'}})()`}</Script><I18nProvider locale={locale}>{children}<CookieConsent /></I18nProvider></body></html>;
}

