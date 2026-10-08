'use client';

import { useEffect, useRef } from 'react';

declare global {
    interface Window {
        turnstile?: {
            render: (element: HTMLElement, options: {
                sitekey: string;
                callback: (token: string) => void;
                'expired-callback'?: () => void;
                'error-callback'?: () => void;
                theme?: 'auto' | 'light' | 'dark';
            }) => string;
            remove: (widgetId: string) => void;
        };
    }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export function Turnstile({ onToken, onError }: {
    onToken: (token: string) => void;
    onError: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);

    useEffect(() => {
        if (!SITE_KEY || !ref.current) return;
        let cancelled = false;

        const render = () => {
            if (cancelled || !ref.current || !window.turnstile) return;
            widgetId.current = window.turnstile.render(ref.current, {
                sitekey: SITE_KEY,
                theme: 'auto',
                callback: onToken,
                'expired-callback': () => onError(),
                'error-callback': () => onError(),
            });
        };

        if (window.turnstile) {
            render();
        } else {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.onload = render;
            script.onerror = onError;
            document.head.appendChild(script);
        }

        return () => {
            cancelled = true;
            if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        };
    }, [onToken, onError]);

    if (!SITE_KEY) return null;
    return <div ref={ref} aria-label="Security verification" />;
}
