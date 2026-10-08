'use client';
import { useI18n } from '@/components/i18n/provider';
export default function ErrorPage({ reset }: {
    error: Error & {
        digest?: string;
    };
    reset: () => void;
}) {
    const { messages: m } = useI18n();
    return <main className="auth-wrap"><section className="auth-card"><div className="eyebrow">{m.common.error}</div><h1 className="auth-title">{m.common.errorTitle}</h1><p className="subtitle">{m.common.errorDescription}</p><button className="btn btn-primary error-action" onClick={() => reset()}>{m.common.retry}</button></section></main>;
}

