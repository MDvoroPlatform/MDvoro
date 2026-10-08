'use client';
import { useState } from 'react';
type Card = { id: string; front: string; back: string; card_type: string; due_at: string };
export function MyFlashcards({ initialCards }: { initialCards: Card[] }) {
  const [cards, setCards] = useState(initialCards);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function remove(id: string) {
    if (!window.confirm('Delete this flashcard? This cannot be undone.')) return;
    setBusy(id); setMessage('');
    try {
      const response = await fetch('/api/flashcards/delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flashcardId: id }) });
      if (!response.ok) throw new Error('delete_failed');
      setCards(current => current.filter(card => card.id !== id));
    } catch { setMessage('Could not delete the flashcard. Please try again.'); }
    finally { setBusy(null); }
  }
  return <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">My flashcards</div><div className="panel-sub">Cards you created yourself. You can delete them at any time.</div></div></div>{message && <div className="form-message">{message}</div>}{cards.length === 0 ? <p className="metric-note">You have no manual flashcards yet.</p> : <div className="fc-my-list">{cards.map(card => <article className="fc-my-row" key={card.id}><div><strong>{card.front}</strong><small>{card.card_type.replaceAll('_', ' ')} · {card.back}</small></div><button className="btn btn-sm" disabled={busy === card.id} onClick={() => void remove(card.id)}>{busy === card.id ? 'Deleting…' : 'Delete'}</button></article>)}</div>}</section>;
}
