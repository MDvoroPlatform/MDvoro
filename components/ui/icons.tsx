type IconProps = {
    size?: number;
    stroke?: number;
};
const base = (p: IconProps) => ({ width: p.size ?? 18, height: p.size ?? 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.stroke ?? 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });
export function Icon({ name, ...p }: IconProps & {
    name: 'grid' | 'book' | 'cards' | 'calendar' | 'chart' | 'settings' | 'search' | 'bell' | 'arrow' | 'target' | 'brain' | 'check' | 'shield' | 'logout' | 'plus' | 'clock' | 'spark' | 'eye' | 'globe' | 'moon' | 'sun' | 'bookmark' | 'trophy';
}) {
    const a = base(p);
    const paths: Record<string, React.ReactNode> = {
        grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
        book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M8 7h8"/></>,
        cards: <><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></>,
        calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M7 2.5v4M17 2.5v4M3 9h18"/></>,
        chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 3 5-7"/></>,
        settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06-1.42 1.42-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V20h-2v-.29A1.8 1.8 0 0 0 12.1 18a1.8 1.8 0 0 0-2 .36l-.06.06-1.42-1.42.06-.06a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 7.4 13.8H7v-2h.4A1.8 1.8 0 0 0 9 10.7a1.8 1.8 0 0 0-.36-2l-.06-.06L10 7.22l.06.06a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 13.2 6V5.7h2V6a1.8 1.8 0 0 0 1.1 1.64 1.8 1.8 0 0 0 2-.36l.06-.06 1.42 1.42-.06.06a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.65 1.1h.29v2h-.29A1.8 1.8 0 0 0 19.4 15z"/></>,
        search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
        bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
        arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
        target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 6-6"/></>,
        brain: <><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 3 4h2v-4a3 3 0 0 0 0-6V4z"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-3 4h-2v-4a3 3 0 0 1 0-6V4z"/><path d="M12 4v16"/></>,
        check: <><path d="m5 12 4 4L19 6"/></>,
        shield: <><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
        logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 3v18"/></>,
        plus: <><path d="M12 5v14M5 12h14"/></>,
        clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
        bookmark: <><path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.5L6 21z"/></>,
        trophy: <><path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6"/></>,
        spark: <><path d="m12 3 1.4 5.1L18 10l-4.6 1.9L12 17l-1.4-5.1L6 10l4.6-1.9z"/><path d="m19 16 .6 2.2L22 19l-2.4.8L19 22l-.6-2.2L16 19l2.4-.8z"/></>,
        eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/></>,
        globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z"/></>,
        moon: <><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.5 8.5 0 1 0 12 12z"/></>,
        sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>
    };
    return <svg {...a}>{paths[name]}</svg>;
}

