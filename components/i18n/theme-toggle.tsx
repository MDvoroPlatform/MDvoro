'use client';
import { useSyncExternalStore } from 'react';
import { useI18n } from './provider';
import { Icon } from '@/components/ui/icons';
type Theme = 'light' | 'dark';
const themeChangeEvent = 'mdvoro-theme-change';
function readTheme(): Theme {
    const saved = localStorage.getItem('mdvoro_theme');
    return saved === 'dark' ? 'dark' : 'light';
}
function subscribeTheme(onChange: () => void) {
    window.addEventListener('storage', onChange);
    window.addEventListener(themeChangeEvent, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(themeChangeEvent, onChange);
    };
}
function applyTheme(value: Theme) {
    const root = document.documentElement;
    root.dataset.theme = value;
    root.classList.toggle('dark', value === 'dark');
}
export function ThemeToggle() {
    const { messages: m } = useI18n();
    const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => 'light');
    function cycle() {
        const next: Theme = theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('mdvoro_theme', next);
        applyTheme(next);
        window.dispatchEvent(new Event(themeChangeEvent));
    }
    const label = theme === 'dark' ? m.theme.light : m.theme.dark;
    return (<button type="button" className="icon-button" onClick={cycle} aria-label={label} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17}/>
    </button>);
}

