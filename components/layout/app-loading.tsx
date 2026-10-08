'use client';
import { useI18n } from '@/components/i18n/provider';
export function AppLoading() { const { messages: m } = useI18n(); return <main className="auth-wrap"><div className="card loading-card">{m.common.loadingWorkspace}</div></main>; }

