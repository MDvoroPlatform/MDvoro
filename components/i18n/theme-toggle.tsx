'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useI18n } from './provider';
import { Icon } from '@/components/ui/icons';
type Theme = 'light' | 'dark' | 'system';
const themeChangeEvent = 'mdvoro-theme-change';
function readTheme(): Theme {
    const saved = localStorage.getItem('mdvoro_theme');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}
function subscribeTheme(onChange: () => void) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => { if (readTheme() === 'system') onChange(); };
    window.addEventListener('storage', onChange);
    window.addEventListener(themeChangeEvent, onChange);
    media.addEventListener?.('change', onSystemChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(themeChangeEvent, onChange);
        media.removeEventListener?.('change', onSystemChange);
    };
}
function applyTheme(value: Theme) {
    const root = document.documentElement;
    root.dataset.theme = value;
    const dark = value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
}
export function ThemeToggle() {
    const { messages: m } = useI18n();
    const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => 'system');
    useEffect(() => applyTheme(theme), [theme]);
    function cycle() {
        const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
        localStorage.setItem('mdvoro_theme', next);
        window.dispatchEvent(new Event(themeChangeEvent));
    }
    const label = theme === 'dark' ? m.theme.light : m.theme.dark;
    return (<button type="button" className="icon-button" onClick={cycle} aria-label={label} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17}/>
    </button>);
}

