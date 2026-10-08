'use client';
import { localeMeta, locales } from '@/lib/i18n/messages';
import { useI18n } from './provider';
import { Icon } from '@/components/ui/icons';
import { useState } from 'react';
export function LocaleSwitcher() {
    const { locale, messages } = useI18n();
    const [busy, setBusy] = useState(false);
    async function change(next: string) {
        if (!locales.some(item => item === next) || next === locale)
            return;
        setBusy(true);
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `mdvoro_locale=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
        window.location.reload();
    }
    return <label className="locale-control" title={messages.shell.language} aria-label={messages.shell.language}>
    <Icon name="globe" size={16}/>
    <select value={locale} onChange={e => void change(e.target.value)} disabled={busy}>
      {locales.map(l => <option key={l} value={l}>{localeMeta[l].nativeLabel}</option>)}
    </select>
  </label>;
}

