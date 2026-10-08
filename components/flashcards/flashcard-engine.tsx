'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';
type Card = {
    id: string;
    front: string;
    back: string;
    card_type: string;
    tags: string[];
    due_at: string;
    interval_days: number;
    difficulty: number;
};
type Stats = {
    total_cards: number;
    due_now: number;
    reviewed_today: number;
    mastered: number;
    learning: number;
    suspended: number;
    average_difficulty: number;
    retention_30d: number;
};
type Rating = 0 | 1 | 2 | 3 | 4;
export function FlashcardEngine({ initialCards, initialStats }: {
    initialCards: Card[];
    initialStats: Stats | null;
}) {
    const { messages: m } = useI18n();
    const [cards] = useState(initialCards);
    const [stats, setStats] = useState(initialStats);
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [startedAt, setStartedAt] = useState(() => Date.now());
    const [error, setError] = useState('');
    const card = cards[index];
    const remaining = Math.max(0, cards.length - index);
    const progress = cards.length ? Math.round(index / cards.length * 100) : 100;
    const dueLabel = !card ? m.flashcards.complete : card.interval_days < 1 ? m.flashcards.build : m.flashcards.intervalLabel.replace('{n}', String(Math.round(card.interval_days)));
    const ratingMeta = useMemo(() => [
        { value: 0 as Rating, label: m.flashcards.ratings.again.label, hint: m.flashcards.ratings.again.hint, key: '1' },
        { value: 1 as Rating, label: m.flashcards.ratings.hard.label, hint: m.flashcards.ratings.hard.hint, key: '2' },
        { value: 2 as Rating, label: m.flashcards.ratings.good.label, hint: m.flashcards.ratings.good.hint, key: '3' },
        { value: 3 as Rating, label: m.flashcards.ratings.easy.label, hint: m.flashcards.ratings.easy.hint, key: '4' },
        { value: 4 as Rating, label: m.flashcards.ratings.perfect.label, hint: m.flashcards.ratings.perfect.hint, key: '5' },
    ], [m]);
    const rate = useCallback(async (value: Rating) => {
        if (!card || busy)
            return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/flashcards/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flashcardId: card.id, rating: value, durationMs: Date.now() - startedAt, mutationId: crypto.randomUUID() }) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(payload.error ?? 'review_failed');
            setStats(c => c ? { ...c, due_now: Math.max(0, c.due_now - 1), reviewed_today: c.reviewed_today + 1 } : c);
            setRevealed(false);
            setIndex(i => i + 1);
            setStartedAt(Date.now());
        }
        catch (error) {
            setError(error instanceof Error && error.message === 'rate_limited' ? m.flashcards.rateLimited : m.flashcards.reviewSaveFailed);
        }
        finally {
            setBusy(false);
        }
    }, [card, busy, startedAt, m.flashcards.rateLimited, m.flashcards.reviewSaveFailed]);
    useEffect(() => {
        if (!card)
            return;
        const onKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
                return;
            if (event.code === 'Space') {
                event.preventDefault();
                if (!revealed)
                    setRevealed(true);
                return;
            }
            if (revealed && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(event.code))
                void rate(Number(event.code.slice(-1)) - 1 as Rating);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [card, revealed, rate]);
    if (!card)
        return <Completion stats={stats}/>;
    return <div className="fc-engine">
    <div className="fc-progress"><progress max={100} value={progress} aria-label={m.common.review}/><span>{m.flashcards.remainingDue.replace('{n}', String(remaining))}</span></div>
    <div className="fc-session-head"><div><span className="eyebrow">{m.common.review}</span><h2>{m.flashcards.reviewTitle}</h2><p>{m.flashcards.reviewSub}</p></div><div className="fc-session-badge"><Icon name="spark" size={16}/>{dueLabel}</div></div>
    <article className={`fc-card ${revealed ? 'revealed' : ''}`}>
      <div className="fc-card-top"><span>{m.flashcards.cardTypes[card.card_type as keyof typeof m.flashcards.cardTypes] ?? card.card_type.replaceAll('_', ' ')}</span><span>{m.flashcards.difficulty} {card.difficulty.toFixed(1)}/10</span></div>
      <div className="fc-face"><div className="fc-label">{m.flashcards.recall}</div><div className="fc-front">{card.front}</div>
        {!revealed ? <button type="button" className="btn btn-primary fc-reveal" onClick={() => setRevealed(true)}><Icon name="eye" size={16}/>{m.flashcards.reveal}<kbd>Space</kbd></button> : <><div className="fc-divider"/><div className="fc-label">{m.flashcards.answer}</div><div className="fc-back">{card.back}</div></>}
      </div>
      {revealed && <div className="fc-rating">{ratingMeta.map(r => <button type="button" key={r.value} disabled={busy} className={`fc-rate fc-rate-${r.value}`} onClick={() => void rate(r.value)}><strong>{r.label}</strong><small>{r.hint}</small><kbd>{r.key}</kbd></button>)}</div>}
    </article>
    <div className="fc-insight"><Icon name="spark" size={16}/><div><strong>{m.flashcards.adaptive}</strong><span>{m.flashcards.adaptiveText}</span></div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
  </div>;
}
function Completion({ stats }: {
    stats: Stats | null;
}) { const { messages: m } = useI18n(); return <div className="fc-complete card"><div className="fc-complete-icon"><Icon name="check" size={25}/></div><span className="eyebrow">{m.flashcards.complete}</span><h2>{m.flashcards.nothingDue}</h2><p>{m.flashcards.clearQueue}</p><div className="fc-complete-stats"><div><b>{stats?.reviewed_today ?? 0}</b><span>{m.flashcards.reviewedToday}</span></div><div><b>{stats?.retention_30d ?? 0}%</b><span>{m.flashcards.retention30}</span></div><div><b>{stats?.mastered ?? 0}</b><span>{m.flashcards.mastered}</span></div></div></div>; }

