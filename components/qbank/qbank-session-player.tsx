'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/provider';

type SessionItem = {
  position: number;
  block: number;
  answered: boolean;
  correct: boolean | null;
  marked: boolean;
  has_note: boolean;
};

type Question = {
  id: string;
  content_code: string;
  exam_id: string;
  stem: string;
  subject: string;
  topic: string | null;
  reconstruction?: { is_reconstruction: boolean; year: number | null; label: string } | null;
  options: { id: string; text: string }[];
  difficulty: number | null;
  key_terms: string[];
  answered: boolean;
  selected_answer: string | null;
  is_correct: boolean | null;
  correct_answer: string | null;
  explanation: string | null;
  key_learning_point: string | null;
  note: string | null;
  media: { id: string; kind: string; alt_text: string; external_url: string | null; caption: string | null; position: number }[];
};

type SessionState = {
  session: {
    id: string;
    exam_code: string;
    exam_name: string;
    mode: 'practice' | 'exam';
    status: 'in_progress' | 'completed' | 'expired' | 'abandoned';
    requested_count: number;
    time_limit_seconds: number | null;
    started_at: string;
    current_position: number;
    current_block: number;
    block_count: number;
    block_duration_minutes: number;
    block_max_items: number;
    previous_block_review_allowed: boolean;
    break_seconds_allowed: number;
    break_seconds_used: number;
    break_remaining_seconds: number;
    break_started_at: string | null;
    on_break: boolean;
  };
  question: Question | null;
  items: SessionItem[];
};

type ApiErrorBody = { error?: string };
type AnswerResponse = { already_answered?: boolean; is_correct?: boolean; selected_answer?: string | null; error?: string };

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => ({}));
  return value as T;
}

export function QBankSessionPlayer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { messages: m } = useI18n();
  const [state, setState] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakBusy, setBreakBusy] = useState(false);
  const [breakRemaining, setBreakRemaining] = useState(0);
  const [blockRemaining, setBlockRemaining] = useState<number | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(() => Date.now());
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [flashcardStatus, setFlashcardStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const currentPosition = state?.session.current_position ?? 1;
  const isLast = currentPosition >= (state?.session.requested_count ?? 0);
  const isExam = state?.session.mode === 'exam';
  const hasAnswered = state?.question?.answered ?? false;
  const canSeeKeyTerms = !isExam || hasAnswered;

  const load = useCallback(async (position = 0) => {
    try {
      const response = await fetch(`/api/qbank/session/${sessionId}/state?position=${position}`, { cache: 'no-store' });
      const body = await readJson<SessionState & ApiErrorBody>(response);
      if (!response.ok) {
        if (body.error === 'session_expired') {
          await fetch(`/api/qbank/session/${sessionId}/finish`, { method: 'POST' });
          router.replace(`/qbank/session/${sessionId}/result`);
          return;
        }
        if (body.error === 'block_closed') throw new Error(m.qbank.blockClosed);
        if (body.error === 'block_not_open') throw new Error(m.qbank.blockNotOpen);
        throw new Error(body.error ?? m.common.error);
      }
      const nextState = body as SessionState;
      setError(null);
      setState(nextState);
      setSelected(nextState.question?.selected_answer ?? null);
      setNote(nextState.question?.note ?? '');
      setQuestionStartedAt(Date.now());
      setConfidence(null);
      setKeyVisible(false);
      setFlashcardStatus('idle');
      setBreakRemaining(nextState.session.break_remaining_seconds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.common.error);
    } finally {
      setLoading(false);
    }
  }, [m.common.error, m.qbank.blockClosed, m.qbank.blockNotOpen, router, sessionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(0), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!state?.session.time_limit_seconds) return;
    const started = new Date(state.session.started_at).getTime();
    const total = state.session.time_limit_seconds;
    const tick = () => {
      const wallElapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      setRemaining(Math.max(0, total - wallElapsed));
      if (state.session.mode === 'exam' && state.session.block_duration_minutes > 0 && !state.session.on_break) {
        const activeElapsed = Math.max(0, wallElapsed - state.session.break_seconds_used);
        const blockSeconds = state.session.block_duration_minutes * 60;
        setBlockRemaining(blockSeconds - (activeElapsed % blockSeconds));
      } else {
        setBlockRemaining(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [state?.session]);

  useEffect(() => {
    if (!state?.session.on_break) return;
    const timer = window.setInterval(() => setBreakRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [state?.session.on_break]);

  useEffect(() => {
    if (remaining !== 0 || state?.session.status !== 'in_progress') return;
    const finishExpired = async () => {
      await fetch(`/api/qbank/session/${sessionId}/finish`, { method: 'POST' });
      router.replace(`/qbank/session/${sessionId}/result`);
    };
    void finishExpired();
  }, [remaining, router, sessionId, state?.session.status]);

  const answer = useCallback(async () => {
    if (!state || !state.question || !selected || saving || state.question.answered || state.session.on_break) return;
    setSaving(true);
    setError(null);
    const mutationId = crypto.randomUUID();
    let response: Response | null = null;
    let body: AnswerResponse = {};

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(`/api/qbank/session/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            position: state.session.current_position,
            selectedAnswer: selected,
            durationMs: Math.max(0, Date.now() - questionStartedAt),
            confidence,
            mutationId,
          }),
        });
        body = await readJson<AnswerResponse>(response);
        if (response.ok || attempt === 1) break;
      } catch (cause) {
        if (attempt === 1) setError(cause instanceof Error ? cause.message : m.qbank.couldNotRecord);
      }
    }

    if (!response) {
      setError(m.qbank.couldNotRecord);
      setSaving(false);
      return;
    }
    if (!response.ok) {
      setError(body.error === 'block_closed' ? m.qbank.blockClosed : body.error === 'block_not_open' ? m.qbank.blockNotOpen : body.error === 'session_expired' ? m.qbank.sessionExpired : m.qbank.couldNotRecord);
      setSaving(false);
      return;
    }
    await load(currentPosition);
    setSaving(false);
  }, [confidence, currentPosition, load, m.qbank.blockClosed, m.qbank.blockNotOpen, m.qbank.couldNotRecord, m.qbank.sessionExpired, questionStartedAt, saving, selected, sessionId, state]);

  async function createFlashcardFromMistake() {
    const question = state?.question;
    if (!question || !question.answered || question.is_correct !== false || flashcardStatus === 'saving') return;
    setFlashcardStatus('saving');
    setError(null);
    try {
      const response = await fetch('/api/flashcards/from-question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: question.id }),
      });
      const body = await readJson<{ id?: string; created?: boolean; error?: string }>(response);
      if (!response.ok || !body.id) throw new Error(body.error ?? m.qbank.couldNotCreate);
      setFlashcardStatus('saved');
    } catch (cause) {
      setFlashcardStatus('error');
      setError(cause instanceof Error ? cause.message : m.qbank.couldNotCreate);
    }
  }

  const saveItemState = useCallback(async (marked: boolean, nextNote: string) => {
    if (!state || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/qbank/session/${sessionId}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position: state.session.current_position, marked, note: nextNote }),
      });
      const body = await readJson<ApiErrorBody>(response);
      if (!response.ok) throw new Error(body.error ?? m.qbank.stateFailed);
      await load(currentPosition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.qbank.stateFailed);
    } finally {
      setSaving(false);
    }
  }, [currentPosition, load, m.qbank.stateFailed, saving, sessionId, state]);

  const toggleMark = useCallback(() => {
    const current = state?.items.find((item) => item.position === currentPosition)?.marked ?? false;
    void saveItemState(!current, note);
  }, [currentPosition, note, saveItemState, state]);

  const saveNote = useCallback(() => {
    const current = state?.items.find((item) => item.position === currentPosition)?.marked ?? false;
    void saveItemState(current, note);
  }, [currentPosition, note, saveItemState, state]);

  const startBreak = useCallback(async () => {
    if (!state || state.session.mode !== 'exam' || state.session.on_break || state.session.break_remaining_seconds <= 0 || breakBusy || state.session.current_block <= 1 || (blockRemaining ?? 999) > 60) return;
    setBreakBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/qbank/session/${sessionId}/break/start`, { method: 'POST' });
      const body = await readJson<ApiErrorBody>(response);
      if (!response.ok) throw new Error(body.error ?? m.qbank.breakUnavailable);
      await load(currentPosition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.qbank.breakUnavailable);
    } finally {
      setBreakBusy(false);
    }
  }, [blockRemaining, breakBusy, currentPosition, load, m.qbank.breakUnavailable, sessionId, state]);

  const endBreak = useCallback(async () => {
    if (!state?.session.on_break || breakBusy) return;
    setBreakBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/qbank/session/${sessionId}/break/end`, { method: 'POST' });
      const body = await readJson<ApiErrorBody>(response);
      if (!response.ok) throw new Error(body.error ?? m.qbank.couldNotResume);
      const nextPosition = state.items.find((item) => item.block === state.session.current_block)?.position ?? currentPosition;
      await load(nextPosition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.qbank.couldNotResume);
    } finally {
      setBreakBusy(false);
    }
  }, [breakBusy, currentPosition, load, m.qbank.couldNotResume, sessionId, state]);

  useEffect(() => {
    if (!state) return;
    const question = state.question;
    if (!question || state.session.on_break) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      if (!question.answered && /^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        const option = question.options[index];
        if (option) { event.preventDefault(); setSelected(option.id); }
        return;
      }
      if (event.key === 'Enter' && !question.answered && selected && !saving) {
        event.preventDefault(); void answer();
        return;
      }
      if (event.key.toLowerCase() === 'm' && !saving) {
        event.preventDefault(); toggleMark();
        return;
      }
      if (event.key === 'ArrowRight' && question.answered && !saving && !isLast) {
        event.preventDefault(); void load(currentPosition + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [answer, currentPosition, isLast, load, saving, selected, state, toggleMark]);

  useEffect(() => {
    if (!state?.session.on_break || breakRemaining > 0 || breakBusy) return;
    const timer = window.setTimeout(() => void endBreak(), 0);
    return () => window.clearTimeout(timer);
  }, [breakBusy, breakRemaining, endBreak, state?.session.on_break]);

  const finish = useCallback(async () => {
    if (!state || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/qbank/session/${sessionId}/finish`, { method: 'POST' });
      const body = await readJson<ApiErrorBody>(response);
      if (!response.ok) throw new Error(body.error ?? m.qbank.couldNotFinish);
      router.replace(`/qbank/session/${sessionId}/result`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.qbank.couldNotFinish);
      setSaving(false);
    }
  }, [m.qbank.couldNotFinish, router, saving, sessionId, state]);

  const media = useMemo(() => [...(state?.question?.media ?? [])].sort((a, b) => a.position - b.position), [state?.question?.media]);

  if (loading && !state) return <main className="page-shell"><div className="card card-pad">{m.common.loading}</div></main>;
  if (!state) return <main className="page-shell"><div className="card card-pad"><h1>{m.common.error}</h1><p>{error ?? m.qbank.sessionLoadFailed}</p><button className="btn btn-primary" onClick={() => void load(1)}>{m.common.retry}</button></div></main>;

  const question = state.question;

  const currentItem = state.items.find((item) => item.position === currentPosition);

  return (
    <main className="page-shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">{state.session.exam_code} · {isExam ? m.qbank.examMode : m.qbank.practiceMode}</div>
          <h1>{m.qbank.questionOf} {currentPosition} / {state.session.requested_count}</h1>
          <p className="subtitle">{state.session.exam_name} · {m.qbank.blocks} {state.session.current_block}/{state.session.block_count}</p>
        </div>
        <div className="qbank-session-toolbar"><span className="qbank-shortcuts">1–9 answer · Enter submit · M mark · → next</span>
          {remaining !== null && <span className="session-timer">{formatTime(remaining)}</span>}{isExam && blockRemaining !== null && !state.session.on_break && <span className="session-timer">{m.qbank.blockTime}: {formatTime(blockRemaining)}</span>}
          <button className="btn btn-primary" disabled={saving} onClick={() => void finish()} type="button">{m.qbank.finishSession}</button>
        </div>
      </div>

      {error && <div className="form-message error">{error}</div>}

      {isExam && state.session.break_remaining_seconds > 0 && !state.session.on_break && state.session.current_block > 1 && blockRemaining !== null && state.session.block_duration_minutes * 60 - blockRemaining <= 60 && (
        <div className="break-panel"><span>{m.qbank.breakAvailable} · {Math.ceil(state.session.break_remaining_seconds / 60)} min</span><button className="btn" disabled={breakBusy} onClick={() => void startBreak()} type="button">{m.qbank.takeBreak}</button></div>
      )}
      {state.session.on_break && (
        <div className="break-panel"><div><strong>{m.qbank.onBreak}</strong><div className="panel-sub">{m.qbank.breakRemaining}: {formatTime(breakRemaining)}</div></div><button className="btn btn-primary" disabled={breakBusy || breakRemaining <= 0} onClick={() => void endBreak()} type="button">{m.qbank.resumeExam}</button></div>
      )}

      {!state.session.on_break && question && <section className="qbank-session-layout">
        <div className="card card-pad question-card">
          <div className="question-meta"><span>{question.subject}</span>{question.topic && <span>{question.topic}</span>}{question.reconstruction?.is_reconstruction && <span className="reconstruction-badge">{question.reconstruction.label} {question.reconstruction.year ?? ''}</span>}<span>{m.qbank.difficulty} {question.difficulty ?? '—'}/5</span></div>
          <div className="question-stem">{question.stem}</div>
          {media.length > 0 && <div className="question-media">{media.map((asset) => asset.external_url ? <figure key={asset.id}><img src={asset.external_url} alt={asset.alt_text} loading="lazy" decoding="async" referrerPolicy="no-referrer"/><figcaption>{asset.caption}</figcaption></figure> : null)}</div>}
          <div className="answer-options">
            {question.options.map((option) => {
              const answered = question.answered;
              const correct = answered && option.id === question.correct_answer;
              const wrongSelected = answered && option.id === selected && !question.is_correct;
              return <button key={option.id} className={`answer-option${selected === option.id ? ' selected' : ''}${correct ? ' correct' : ''}${wrongSelected ? ' incorrect' : ''}`} disabled={answered || saving} onClick={() => setSelected(option.id)} type="button"><b>{option.id}</b><span>{option.text}</span></button>;
            })}
          </div>

          {!question.answered ? (
            <>
              <div className="confidence-picker" aria-label={m.qbank.confidence}>
                <span className="panel-sub">{m.qbank.confidence}</span>
                {([1, 2, 3, 4, 5] as const).map((value) => <button className={`btn btn-sm${confidence === value ? ' btn-primary' : ''}`} disabled={saving} key={value} onClick={() => setConfidence(value)} type="button">{value}</button>)}
              </div>
              <button className="btn btn-primary btn-lg" disabled={!selected || saving} onClick={() => void answer()} type="button">{saving ? m.common.loading : m.qbank.submit}</button>
            </>
          ) : (
            <div className={`answer-result ${question.is_correct ? 'answer-correct' : 'answer-wrong'}`}>
              <strong>{question.is_correct ? m.qbank.correct : m.qbank.incorrect}</strong>
              {question.explanation && <p>{question.explanation}</p>}
              {question.key_learning_point && <div className="learning-point"><b>{m.qbank.keyLearning}</b><span>{question.key_learning_point}</span></div>}
              {question.is_correct === false && <div className="mistake-action">
                <button className="btn btn-primary" type="button" disabled={flashcardStatus === 'saving' || flashcardStatus === 'saved'} onClick={() => void createFlashcardFromMistake()}>
                  {flashcardStatus === 'saving' ? m.common.loading : flashcardStatus === 'saved' ? m.common.saved : m.qbank.createFromMistake}
                </button>
                {flashcardStatus === 'error' && <span className="panel-sub">{m.qbank.couldNotCreate}</span>}
              </div>}
            </div>
          )}

          <div className="question-actions qbank-session-tools">
            <textarea aria-label={m.qbank.note} value={note} onChange={(event) => setNote(event.target.value)} placeholder={m.qbank.notePlaceholder} />
            <div className="qbank-tool-row">
              <button className={`btn${currentItem?.marked ? ' btn-primary' : ''}`} disabled={saving} onClick={() => toggleMark()} type="button">{currentItem?.marked ? m.qbank.unmark : m.qbank.markForReview}</button>
              <button className="btn" disabled={saving} onClick={() => saveNote()} type="button">{m.common.save}</button>
              <button className="btn" disabled={!canSeeKeyTerms || question.key_terms.length === 0} onClick={() => setKeyVisible((visible) => !visible)} type="button">{m.qbank.keyTerms}</button>
            </div>
            {keyVisible && canSeeKeyTerms && question.key_terms.length > 0 && <div className="key-terms">{question.key_terms.slice(0, 3).map((term) => <span key={term}>{term}</span>)}</div>}
          </div>
        </div>

        <aside className="card card-pad qbank-session-sidebar">
          <div className="panel-title">{m.qbank.navigator}</div>
          <div className="session-progress"><span>{m.qbank.answered}: {state.items.filter((item) => item.answered).length}</span><span>{m.qbank.marked}: {state.items.filter((item) => item.marked).length}</span></div>
          <div className="qbank-navigator-grid">
            {state.items.map((item) => {
              const locked = isExam && !state.session.previous_block_review_allowed && item.block !== state.session.current_block;
              return <button key={item.position} className={`qbank-nav-item${item.position === currentPosition ? ' current' : ''}${item.answered ? ' answered' : ''}${item.marked ? ' marked' : ''}`} disabled={locked || saving} onClick={() => void load(item.position)} aria-label={`${m.qbank.questionOf} ${item.position}`} type="button">{item.position}</button>;
            })}
          </div>
          <div className="qbank-nav-footer"><button className="btn" disabled={currentPosition <= 1 || saving} onClick={() => void load(currentPosition - 1)}>{m.qbank.previous}</button><button className="btn btn-primary" disabled={isLast || saving} onClick={() => void load(currentPosition + 1)}>{m.qbank.next}</button></div>
        </aside>
      </section>}
    </main>
  );
}
