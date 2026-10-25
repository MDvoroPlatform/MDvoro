'use client';
import Image from 'next/image';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/provider';
import { AnnotationText, type QuestionAnnotation } from '@/components/qbank/annotation-text';
import { createTextAnchor, type AnnotationAnchor } from '@/lib/qbank/annotation-anchor';
import { Icon } from '@/components/ui/icons';
import { LabValuesBrowser, type LabValueRow } from '@/components/library/lab-values-browser';

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
  is_saved?: boolean;
  explanation: string | null;
  key_learning_point: string | null;
  note: string | null;
  media: { id: string; kind: string; alt_text: string; external_url: string | null; url?: string | null; caption: string | null; position: number }[];
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
    practice_paused_seconds: number;
    on_break: boolean;
  };
  question: Question | null;
  items: SessionItem[];
};

type ApiErrorBody = { error?: string };
type AnswerResponse = { already_answered?: boolean; is_correct?: boolean; selected_answer?: string | null; error?: string };
type IssueCategory = 'incorrect_answer' | 'typo' | 'unclear' | 'outdated' | 'other';

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
  const { messages: m, locale } = useI18n();
  const [state, setState] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakBusy, setBreakBusy] = useState(false);
  const [breakRemaining, setBreakRemaining] = useState(0);
  const [blockRemaining, setBlockRemaining] = useState<number | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(() => Date.now());
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [flashcardStatus, setFlashcardStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [annotations, setAnnotations] = useState<QuestionAnnotation[]>([]);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ segmentKey: string; anchor: AnnotationAnchor } | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [annotationNote, setAnnotationNote] = useState('');
  const [annotationColor, setAnnotationColor] = useState<QuestionAnnotation['color']>('yellow');
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [annotationError, setAnnotationError] = useState('');
  const [questionRating, setQuestionRating] = useState<number | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<IssueCategory>('incorrect_answer');
  const [reportMessage, setReportMessage] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [infoTab, setInfoTab] = useState<'key-info' | 'attending-tip' | 'labs'>('key-info');
  const [isSaved, setIsSaved] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [labValues, setLabValues] = useState<LabValueRow[] | null>(null);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labsError, setLabsError] = useState(false);
  const timerCopy = ({ en: { elapsed: 'Elapsed', pause: 'Pause', resume: 'Resume', paused: 'Practice paused' }, he: { elapsed: 'זמן שחלף', pause: 'השהה', resume: 'המשך', paused: 'התרגול מושהה' }, ar: { elapsed: 'الوقت المنقضي', pause: 'إيقاف مؤقت', resume: 'استئناف', paused: 'التدريب متوقف مؤقتًا' }, ru: { elapsed: 'Прошло', pause: 'Пауза', resume: 'Продолжить', paused: 'Практика приостановлена' } } as const)[locale];
  const clinicalCopy = ({
    en: { keyInfo: 'Key info', attendingTip: 'Attending tip', labs: 'Labs', reviewAfterAnswer: 'Answer the question to review its explanation and key information.', noTip: 'No attending tip is available for this question.', referenceRanges: 'Approved reference ranges', referenceNote: 'General educational ranges, not values specific to this question. Use the range reported by the testing laboratory.', labsUnavailable: 'Reference ranges could not be loaded.', elapsed: 'Elapsed' },
    ar: { keyInfo: 'معلومات أساسية', attendingTip: 'نصيحة الاستشاري', labs: 'المختبرات', reviewAfterAnswer: 'أجب عن السؤال لمراجعة الشرح والمعلومات الأساسية.', noTip: 'لا تتوفر نصيحة استشاري لهذا السؤال.', referenceRanges: 'القيم المرجعية المعتمدة', referenceNote: 'مجالات تعليمية عامة وليست نتائج خاصة بهذا السؤال. اعتمد المجال المطبوع في تقرير المختبر.', labsUnavailable: 'تعذر تحميل القيم المرجعية.', elapsed: 'المنقضي' },
    he: { keyInfo: 'מידע מרכזי', attendingTip: 'טיפ מהמומחה', labs: 'בדיקות', reviewAfterAnswer: 'יש לענות על השאלה כדי לעיין בהסבר ובמידע המרכזי.', noTip: 'אין טיפ מומחה זמין לשאלה זו.', referenceRanges: 'טווחי ייחוס מאושרים', referenceNote: 'טווחים לימודיים כלליים, לא ערכים ספציפיים לשאלה. יש להשתמש בטווח שמופיע בדוח המעבדה.', labsUnavailable: 'לא ניתן לטעון את טווחי הייחוס.', elapsed: 'זמן שחלף' },
    ru: { keyInfo: 'Главное', attendingTip: 'Совет врача', labs: 'Анализы', reviewAfterAnswer: 'Ответьте на вопрос, чтобы просмотреть объяснение и ключевую информацию.', noTip: 'Для этого вопроса нет совета врача.', referenceRanges: 'Утверждённые референсные интервалы', referenceNote: 'Общие учебные интервалы, не значения для этого вопроса. Используйте диапазон из бланка лаборатории.', labsUnavailable: 'Не удалось загрузить референсные интервалы.', elapsed: 'Прошло' },
  } as const)[locale];
  const sessionActions = ({ en: { exit: 'Exit to history', leaving: 'Saving…', leaveError: 'Could not save this session before leaving.' }, ar: { exit: 'الخروج إلى سجل الجلسات', leaving: 'جارٍ الحفظ…', leaveError: 'تعذر حفظ الجلسة قبل الخروج.' }, he: { exit: 'יציאה להיסטוריה', leaving: 'שומר…', leaveError: 'לא ניתן לשמור את המפגש לפני היציאה.' }, ru: { exit: 'Выйти в историю', leaving: 'Сохранение…', leaveError: 'Не удалось сохранить сессию перед выходом.' } } as const)[locale];

  const currentPosition = state?.session.current_position ?? 1;
  const isLast = currentPosition >= (state?.session.requested_count ?? 0);
  const isExam = state?.session.mode === 'exam';
  const hasAnswered = state?.question?.answered ?? false;
  const canSeeKeyTerms = !isExam || hasAnswered;
  const questionAnnotations = annotations.filter((annotation) => annotation.question_id === state?.question?.id);
  const activeAnnotation = questionAnnotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;

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
      setAnnotations([]);
      setPendingAnnotation(null);
      setActiveAnnotationId(null);
      setAnnotationError('');
      setState(nextState);
      setSelected(nextState.question?.selected_answer ?? null);
      setNote(nextState.question?.note ?? '');
      setQuestionStartedAt(Date.now());
      setConfidence(null);
      setKeyVisible(false);
      setInfoTab('key-info');
      setFlashcardStatus('idle');
      setIsSaved(nextState.question?.is_saved ?? false);
      setBreakRemaining(nextState.session.break_remaining_seconds);
      setQuestionRating(null);
      setReportOpen(false);
      setReportMessage('');
      setReportSubmitted(false);
      setFeedbackMessage('');
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
    if (!state) return;
    const started = new Date(state.session.started_at).getTime();
    if (state.session.mode === 'practice') {
      const tick = () => {
        const wallElapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
        const pausedNow = state.session.on_break && state.session.break_started_at
          ? Math.max(0, Math.floor((Date.now() - new Date(state.session.break_started_at).getTime()) / 1000)) : 0;
        setElapsedSeconds(Math.max(0, wallElapsed - (state.session.practice_paused_seconds ?? 0) - pausedNow));
      };
      tick();
      if (state.session.on_break) return;
      const timer = window.setInterval(tick, 1000);
      return () => window.clearInterval(timer);
    }
    if (!state.session.time_limit_seconds) return;
    const total = state.session.time_limit_seconds;
    const tick = () => {
      const wallElapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      setRemaining(Math.max(0, total - wallElapsed));
      const pausedNow = state.session.on_break && state.session.break_started_at
        ? Math.max(0, Math.floor((Date.now() - new Date(state.session.break_started_at).getTime()) / 1000)) : 0;
      setElapsedSeconds(Math.max(0, wallElapsed - (state.session.break_seconds_used ?? 0) - pausedNow));
      if (state.session.mode === 'exam' && state.session.block_duration_minutes > 0 && !state.session.on_break) {
        const activeElapsed = Math.max(0, wallElapsed - (state.session.break_seconds_used ?? 0));
        const blockSeconds = state.session.block_duration_minutes * 60;
        setBlockRemaining(blockSeconds - (activeElapsed % blockSeconds));
      } else {
        setBlockRemaining(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

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

  async function createFlashcardFromQuestion() {
    const question = state?.question;
    if (!question || flashcardStatus === 'saving') return;
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

  const toggleSaved = useCallback(async () => {
    const questionId = state?.question?.id;
    if (!questionId || bookmarkBusy) return;
    setBookmarkBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/qbank/bookmarks', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId, saved: !isSaved }),
      });
      const body = await readJson<ApiErrorBody>(response);
      if (!response.ok) throw new Error(body.error ?? m.qbank.stateFailed);
      setIsSaved(!isSaved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.qbank.stateFailed);
    } finally { setBookmarkBusy(false); }
  }, [bookmarkBusy, isSaved, m.qbank.stateFailed, state?.question?.id]);

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
    if (state?.session.mode !== 'exam' || !state.session.on_break || breakBusy) return;
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

  const togglePracticePause = useCallback(async () => {
    if (!state || state.session.mode !== 'practice' || breakBusy) return;
    setBreakBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/qbank/session/${sessionId}/timer`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: state.session.on_break ? 'resume' : 'pause' }),
      });
      if (!response.ok) throw new Error(timerCopy.resume);
      await load(currentPosition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : timerCopy.resume);
    } finally { setBreakBusy(false); }
  }, [breakBusy, currentPosition, load, sessionId, state, timerCopy.resume]);

  const loadLabs = useCallback(async () => {
    if (labValues || labsLoading) return;
    setLabsLoading(true);
    setLabsError(false);
    try {
      const response = await fetch('/api/qbank/labs', { cache: 'no-store' });
      const body = await readJson<{ values?: LabValueRow[] } & ApiErrorBody>(response);
      if (!response.ok || !body.values) throw new Error(body.error ?? 'labs_unavailable');
      setLabValues(body.values);
    } catch {
      setLabsError(true);
    } finally {
      setLabsLoading(false);
    }
  }, [labValues, labsLoading]);

  const exitToHistory = useCallback(async () => {
    if (!state || leaving || saving) return;
    setLeaving(true);
    setError(null);
    try {
      if (!state.session.on_break && state.question && note !== (state.question.note ?? '')) {
        const marked = state.items.find((item) => item.position === currentPosition)?.marked ?? false;
        const response = await fetch(`/api/qbank/session/${sessionId}/state`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ position: currentPosition, marked, note }),
        });
        if (!response.ok) throw new Error('save_failed');
      }
      if (state.session.mode === 'practice' && !state.session.on_break) {
        const response = await fetch(`/api/qbank/session/${sessionId}/timer`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'pause' }),
        });
        if (!response.ok) throw new Error('pause_failed');
      }
      router.push('/qbank/history');
    } catch {
      setError(sessionActions.leaveError);
      setLeaving(false);
    }
  }, [currentPosition, leaving, note, router, saving, sessionActions.leaveError, sessionId, state]);

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
    if (state?.session.mode !== 'exam' || !state.session.on_break || breakRemaining > 0 || breakBusy) return;
    const timer = window.setTimeout(() => void endBreak(), 0);
    return () => window.clearTimeout(timer);
  }, [breakBusy, breakRemaining, endBreak, state?.session.mode, state?.session.on_break]);

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

  const confirmFinishCopy = {
    en: 'Finish this session now? Your recorded answers and progress will be saved.',
    ar: 'هل تريد إنهاء الجلسة الآن؟ ستُحفظ إجاباتك وتقدمك المسجل.',
    he: 'לסיים את המפגש עכשיו? התשובות וההתקדמות שנשמרו יישארו זמינות.',
    ru: 'Завершить сессию сейчас? Записанные ответы и прогресс будут сохранены.',
  }[locale] ?? 'Finish this session now? Your recorded answers and progress will be saved.';
  const annotationCopy = {
    en: { title: 'Private highlights', help: 'Select text in the question, choices, or explanation to highlight it.', note: 'Private note for this passage', placeholder: 'Add a note about this passage…', save: 'Save highlight', saveNote: 'Save note', remove: 'Remove highlight', cancel: 'Cancel', loadError: 'Could not load private highlights.', saveError: 'Could not save this highlight.', updateError: 'Could not update this highlight.', deleteError: 'Could not remove this highlight.', colors: { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', orange: 'Orange' } },
    ar: { title: 'التظليلات الخاصة', help: 'حدد نصًا من السؤال أو الخيارات أو الشرح لتظليله.', note: 'ملاحظة خاصة لهذا المقطع', placeholder: 'أضف ملاحظة لهذا المقطع…', save: 'حفظ التظليل', saveNote: 'حفظ الملاحظة', remove: 'حذف التظليل', cancel: 'إلغاء', loadError: 'تعذر تحميل التظليلات الخاصة.', saveError: 'تعذر حفظ هذا التظليل.', updateError: 'تعذر تعديل هذا التظليل.', deleteError: 'تعذر حذف هذا التظليل.', colors: { yellow: 'أصفر', green: 'أخضر', blue: 'أزرق', pink: 'وردي', orange: 'برتقالي' } },
    he: { title: 'הדגשות פרטיות', help: 'בחרו טקסט בשאלה, בתשובות או בהסבר כדי להדגיש אותו.', note: 'הערה פרטית לקטע הזה', placeholder: 'הוסיפו הערה לקטע…', save: 'שמירת הדגשה', saveNote: 'שמירת הערה', remove: 'הסרת הדגשה', cancel: 'ביטול', loadError: 'לא ניתן לטעון הדגשות פרטיות.', saveError: 'לא ניתן לשמור את ההדגשה.', updateError: 'לא ניתן לעדכן את ההדגשה.', deleteError: 'לא ניתן להסיר את ההדגשה.', colors: { yellow: 'צהוב', green: 'ירוק', blue: 'כחול', pink: 'ורוד', orange: 'כתום' } },
    ru: { title: 'Личные выделения', help: 'Выделите текст вопроса, вариантов или объяснения.', note: 'Личная заметка к этому фрагменту', placeholder: 'Добавьте заметку к фрагменту…', save: 'Сохранить выделение', saveNote: 'Сохранить заметку', remove: 'Удалить выделение', cancel: 'Отмена', loadError: 'Не удалось загрузить личные выделения.', saveError: 'Не удалось сохранить выделение.', updateError: 'Не удалось изменить выделение.', deleteError: 'Не удалось удалить выделение.', colors: { yellow: 'Жёлтый', green: 'Зелёный', blue: 'Синий', pink: 'Розовый', orange: 'Оранжевый' } },
  }[locale] ?? { title: 'Private highlights', help: 'Select text in the question, choices, or explanation to highlight it.', note: 'Private note for this passage', placeholder: 'Add a note about this passage…', save: 'Save highlight', saveNote: 'Save note', remove: 'Remove highlight', cancel: 'Cancel', loadError: 'Could not load private highlights.', saveError: 'Could not save this highlight.', updateError: 'Could not update this highlight.', deleteError: 'Could not remove this highlight.', colors: { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', orange: 'Orange' } };
  const feedbackCopy = {
    en: { rate: 'How useful was this question?', rated: 'Thanks for rating this question.', report: 'Report a problem', reportSent: 'Report submitted. Thank you for helping improve the bank.', category: 'Problem type', message: 'Details (optional)', placeholder: 'Describe the problem briefly…', noPatient: 'Please do not include patient or personal information.', submit: 'Send report', cancel: 'Cancel', ratingError: 'Could not save your rating.', reportError: 'Could not submit your report.', categories: { incorrect_answer: 'Incorrect answer or explanation', typo: 'Typo', unclear: 'Unclear wording', outdated: 'Outdated information', other: 'Other' } },
    ar: { rate: 'ما مدى فائدة هذا السؤال؟', rated: 'شكرًا لتقييم السؤال.', report: 'الإبلاغ عن مشكلة', reportSent: 'تم إرسال البلاغ. شكرًا لمساعدتنا في تحسين البنك.', category: 'نوع المشكلة', message: 'التفاصيل (اختياري)', placeholder: 'صف المشكلة باختصار…', noPatient: 'يرجى عدم تضمين معلومات مريض أو معلومات شخصية.', submit: 'إرسال البلاغ', cancel: 'إلغاء', ratingError: 'تعذر حفظ التقييم.', reportError: 'تعذر إرسال البلاغ.', categories: { incorrect_answer: 'إجابة أو شرح غير صحيح', typo: 'خطأ مطبعي', unclear: 'صياغة غير واضحة', outdated: 'معلومة قديمة', other: 'أخرى' } },
    he: { rate: 'עד כמה השאלה הייתה מועילה?', rated: 'תודה על דירוג השאלה.', report: 'דיווח על בעיה', reportSent: 'הדיווח נשלח. תודה על העזרה בשיפור המאגר.', category: 'סוג הבעיה', message: 'פרטים (לא חובה)', placeholder: 'תארו את הבעיה בקצרה…', noPatient: 'אין לכלול מידע על מטופלים או מידע אישי.', submit: 'שליחת דיווח', cancel: 'ביטול', ratingError: 'לא ניתן לשמור את הדירוג.', reportError: 'לא ניתן לשלוח את הדיווח.', categories: { incorrect_answer: 'תשובה או הסבר שגויים', typo: 'שגיאת כתיב', unclear: 'ניסוח לא ברור', outdated: 'מידע לא מעודכן', other: 'אחר' } },
    ru: { rate: 'Насколько полезен этот вопрос?', rated: 'Спасибо за оценку.', report: 'Сообщить о проблеме', reportSent: 'Сообщение отправлено. Спасибо за помощь.', category: 'Тип проблемы', message: 'Подробности (необязательно)', placeholder: 'Кратко опишите проблему…', noPatient: 'Не указывайте данные пациентов или личную информацию.', submit: 'Отправить', cancel: 'Отмена', ratingError: 'Не удалось сохранить оценку.', reportError: 'Не удалось отправить сообщение.', categories: { incorrect_answer: 'Неверный ответ или объяснение', typo: 'Опечатка', unclear: 'Непонятная формулировка', outdated: 'Устаревшая информация', other: 'Другое' } },
  }[locale] ?? { rate: 'How useful was this question?', rated: 'Thanks for rating this question.', report: 'Report a problem', reportSent: 'Report submitted. Thank you for helping improve the bank.', category: 'Problem type', message: 'Details (optional)', placeholder: 'Describe the problem briefly…', noPatient: 'Please do not include patient or personal information.', submit: 'Send report', cancel: 'Cancel', ratingError: 'Could not save your rating.', reportError: 'Could not submit your report.', categories: { incorrect_answer: 'Incorrect answer or explanation', typo: 'Typo', unclear: 'Unclear wording', outdated: 'Outdated information', other: 'Other' } };

  useEffect(() => {
    const questionId = state?.question?.id;
    if (!questionId) return;
    let current = true;
    void fetch(`/api/qbank/annotations?questionId=${encodeURIComponent(questionId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await readJson<QuestionAnnotation[] | ApiErrorBody>(response);
        if (!response.ok) throw new Error(annotationCopy.loadError);
        if (current && Array.isArray(body)) setAnnotations(body);
      })
      .catch((cause) => { if (current) setAnnotationError(cause instanceof Error ? cause.message : annotationCopy.loadError); });
    return () => { current = false; };
  }, [annotationCopy.loadError, state?.question?.id]);

  useEffect(() => {
    const questionId = state?.question?.id;
    if (!questionId) return;
    let current = true;
    void fetch(`/api/qbank/ratings?questionId=${encodeURIComponent(questionId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await readJson<{ rating: number | null }>(response);
        if (response.ok && current) setQuestionRating(body.rating);
      })
      .catch(() => { /* Rating is optional; the question remains usable if it cannot load. */ });
    return () => { current = false; };
  }, [state?.question?.id]);

  async function saveQuestionRating(value: number) {
    if (!question || ratingBusy) return;
    setRatingBusy(true);
    setFeedbackMessage('');
    try {
      const response = await fetch('/api/qbank/ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ questionId: question.id, rating: value }) });
      if (!response.ok) throw new Error(feedbackCopy.ratingError);
      setQuestionRating(value);
      setFeedbackMessage(feedbackCopy.rated);
    } catch (cause) {
      setFeedbackMessage(cause instanceof Error ? cause.message : feedbackCopy.ratingError);
    } finally { setRatingBusy(false); }
  }

  async function submitQuestionReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question || reportBusy) return;
    setReportBusy(true);
    setFeedbackMessage('');
    try {
      const response = await fetch('/api/qbank/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ questionId: question.id, category: reportCategory, message: reportMessage }) });
      if (!response.ok) throw new Error(feedbackCopy.reportError);
      setReportSubmitted(true);
      setReportOpen(false);
      setReportMessage('');
      setFeedbackMessage(feedbackCopy.reportSent);
    } catch (cause) {
      setFeedbackMessage(cause instanceof Error ? cause.message : feedbackCopy.reportError);
    } finally { setReportBusy(false); }
  }

  const media = useMemo(() => [...(state?.question?.media ?? [])].sort((a, b) => a.position - b.position), [state?.question?.media]);

  if (loading && !state) return <main className="page-shell"><div className="card card-pad">{m.common.loading}</div></main>;
  if (!state) return <main className="page-shell"><div className="card card-pad"><h1>{m.common.error}</h1><p>{error ?? m.qbank.sessionLoadFailed}</p><button className="btn btn-primary" onClick={() => void load(1)}>{m.common.retry}</button></div></main>;

  const question = state.question;

  const currentItem = state.items.find((item) => item.position === currentPosition);
  function captureTextSelection(event: SyntheticEvent<HTMLElement>) {
    const eventTarget = event.target;
    if (eventTarget instanceof Element && eventTarget.closest('.qbank-annotations,button,input,textarea,select,[role="dialog"]')) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) return;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const element = node instanceof Element ? node : node.parentElement;
    const surface = element?.closest<HTMLElement>('[data-annotation-segment]');
    if (!surface || !surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return;
    const text = surface.textContent ?? '';
    const startRange = range.cloneRange();
    startRange.selectNodeContents(surface);
    startRange.setEnd(range.startContainer, range.startOffset);
    const start = startRange.toString().length;
    const selectedText = range.toString();
    const anchor = createTextAnchor(text, start, start + selectedText.length);
    if (!anchor || text.slice(start, start + selectedText.length) !== selectedText) return;
    setActiveAnnotationId(null);
    setAnnotationNote('');
    setAnnotationColor('yellow');
    setPendingAnnotation({ segmentKey: surface.dataset.annotationSegment ?? 'stem', anchor });
    setAnnotationError('');
  }

  async function saveNewAnnotation() {
    if (!pendingAnnotation || !question || annotationBusy) return;
    setAnnotationBusy(true);
    setAnnotationError('');
    try {
      const response = await fetch('/api/qbank/annotations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          questionId: question.id,
          segmentKey: pendingAnnotation.segmentKey,
          quote: pendingAnnotation.anchor.quote,
          prefix: pendingAnnotation.anchor.prefix,
          suffix: pendingAnnotation.anchor.suffix,
          startOffset: pendingAnnotation.anchor.start_offset,
          endOffset: pendingAnnotation.anchor.end_offset,
          color: annotationColor,
          note: annotationNote.trim() || null,
        }),
      });
      const body = await readJson<QuestionAnnotation & ApiErrorBody>(response);
      if (!response.ok) throw new Error(annotationCopy.saveError);
      setAnnotations((current) => [...current.filter((annotation) => annotation.id !== body.id), body]);
      setActiveAnnotationId(body.id);
      setPendingAnnotation(null);
      window.getSelection()?.removeAllRanges();
    } catch (cause) {
      setAnnotationError(cause instanceof Error ? cause.message : annotationCopy.saveError);
    } finally { setAnnotationBusy(false); }
  }

  async function updateActiveAnnotation(patch: { color?: QuestionAnnotation['color']; note?: string | null }) {
    if (!activeAnnotation || annotationBusy) return;
    setAnnotationBusy(true);
    setAnnotationError('');
    try {
      const response = await fetch('/api/qbank/annotations', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: activeAnnotation.id, ...patch }) });
      const body = await readJson<QuestionAnnotation & ApiErrorBody>(response);
      if (!response.ok) throw new Error(annotationCopy.updateError);
      setAnnotations((current) => current.map((annotation) => annotation.id === body.id ? body : annotation));
      if (patch.note !== undefined) setAnnotationNote(body.note ?? '');
    } catch (cause) {
      setAnnotationError(cause instanceof Error ? cause.message : annotationCopy.updateError);
    } finally { setAnnotationBusy(false); }
  }

  async function deleteActiveAnnotation() {
    if (!activeAnnotation || annotationBusy) return;
    setAnnotationBusy(true);
    setAnnotationError('');
    try {
      const response = await fetch('/api/qbank/annotations', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: activeAnnotation.id }) });
      if (!response.ok) throw new Error(annotationCopy.deleteError);
      setAnnotations((current) => current.filter((annotation) => annotation.id !== activeAnnotation.id));
      setActiveAnnotationId(null);
      setAnnotationNote('');
    } catch (cause) {
      setAnnotationError(cause instanceof Error ? cause.message : annotationCopy.deleteError);
    } finally { setAnnotationBusy(false); }
  }

  return (
    <main className="page-shell qbank-player" data-active-qbank-session>
      <header className="page-head qbank-player-head">
        <div>
          <div className="eyebrow">QUESTION BANK</div>
          <h1>{m.qbank.questionOf} {String(currentPosition).padStart(2, '0')} / {String(state.session.requested_count).padStart(2, '0')}</h1>
          <p className="subtitle">{state.session.exam_name} · {state.session.exam_code} · {isExam ? m.qbank.examMode : m.qbank.practiceMode} · {m.qbank.blocks} {state.session.current_block}/{state.session.block_count}</p>
        </div>
        <div className="qbank-session-toolbar">
          {(isExam ? remaining !== null : true) && <span className="session-timer"><Icon name="clock" size={18}/>{formatTime(isExam ? remaining ?? 0 : elapsedSeconds)}</span>}
          {isExam && blockRemaining !== null && !state.session.on_break && <span className="session-timer qbank-block-timer">{m.qbank.blockTime}: {formatTime(blockRemaining)}</span>}
          <button className="btn" disabled={saving || leaving} onClick={() => void exitToHistory()} type="button"><Icon name="logout" size={18}/>{leaving ? sessionActions.leaving : sessionActions.exit}</button>
          <button className="btn qbank-header-exit" disabled={saving} onClick={() => setConfirmFinish(true)} type="button"><Icon name="logout" size={18}/>{m.qbank.finishSession}</button>
        </div>
      </header>
      <div className="qbank-overall-progress" role="progressbar" aria-label={`${m.qbank.questionOf} ${currentPosition} / ${state.session.requested_count}`} aria-valuemin={0} aria-valuemax={state.session.requested_count} aria-valuenow={currentPosition}><span style={{ width: `${Math.min(100, (currentPosition / Math.max(1, state.session.requested_count)) * 100)}%` }}/></div>

      {error && <div className="form-message error">{error}</div>}

      {isExam && state.session.break_remaining_seconds > 0 && !state.session.on_break && state.session.current_block > 1 && blockRemaining !== null && state.session.block_duration_minutes * 60 - blockRemaining <= 60 && (
        <div className="break-panel"><span>{m.qbank.breakAvailable} · {Math.ceil(state.session.break_remaining_seconds / 60)} min</span><button className="btn" disabled={breakBusy} onClick={() => void startBreak()} type="button">{m.qbank.takeBreak}</button></div>
      )}
      {state.session.on_break && (
        <div className="break-panel"><div><strong>{!isExam ? timerCopy.paused : m.qbank.onBreak}</strong>{isExam && <div className="panel-sub">{m.qbank.breakRemaining}: {formatTime(breakRemaining)}</div>}</div>{isExam && <button className="btn btn-primary" disabled={breakBusy || breakRemaining <= 0} onClick={() => void endBreak()} type="button">{m.qbank.resumeExam}</button>}</div>
      )}

      {!state.session.on_break && question && <section className="qbank-session-layout" onMouseUp={captureTextSelection} onTouchEnd={captureTextSelection} onKeyUp={captureTextSelection}>
        <div className="card card-pad question-card">
          <div className="qbank-question-top"><div className="question-meta"><span>{question.subject}</span>{question.topic && <span>{question.topic}</span>}{question.reconstruction?.is_reconstruction && <span className="reconstruction-badge">{question.reconstruction.label} {question.reconstruction.year ?? ''}</span>}<span className="qbank-difficulty-chip"><Icon name="chart" size={15}/>{m.qbank.difficulty} {question.difficulty ?? '—'}/5</span></div><button type="button" className={`qbank-bookmark-button${currentItem?.marked ? ' active' : ''}`} aria-label={currentItem?.marked ? m.qbank.unmark : m.qbank.markForReview} aria-pressed={Boolean(currentItem?.marked)} disabled={saving} onClick={() => toggleMark()}><Icon name="bookmark" size={22}/></button></div>
          <div className="question-stem"><AnnotationText text={question.stem} segmentKey="stem" annotations={questionAnnotations}/></div>
          {media.length > 0 && <div className="question-media">{media.map((asset) => {
            const src = asset.url || asset.external_url;
            return src ? <figure key={asset.id}><Image src={src} alt={asset.alt_text} width={1200} height={800} unoptimized loading="lazy" decoding="async" referrerPolicy="no-referrer"/><figcaption>{asset.caption}</figcaption></figure> : null;
          })}</div>}
          <div className="answer-options">
            {question.options.map((option) => {
              const answered = question.answered;
              const correct = answered && option.id === question.correct_answer;
              const wrongSelected = answered && option.id === selected && !question.is_correct;
              return <button key={option.id} className={`answer-option${selected === option.id ? ' selected' : ''}${correct ? ' correct' : ''}${wrongSelected ? ' incorrect' : ''}`} aria-pressed={selected === option.id} disabled={answered || saving} onClick={() => setSelected(option.id)} type="button"><b>{option.id}</b><span><AnnotationText text={option.text} segmentKey={`option:${option.id}`} annotations={questionAnnotations}/></span>{selected === option.id && <Icon name="check" size={19}/>}</button>;
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
            </div>
          )}

          <div className="question-actions qbank-session-tools">
            <section className="qbank-annotations" aria-label="Private question highlights">
              <div className="panel-head"><div><div className="panel-title">{annotationCopy.title}</div><div className="panel-sub">{annotationCopy.help}</div></div><span className="qbank-annotation-count">{questionAnnotations.length}</span></div>
              {questionAnnotations.length > 0 && <div className="qbank-annotation-list">{questionAnnotations.map((annotation) => <button key={annotation.id} type="button" className={`qbank-annotation-chip annotation-${annotation.color}${activeAnnotationId === annotation.id ? ' active' : ''}`} aria-pressed={activeAnnotationId === annotation.id} onClick={() => { setPendingAnnotation(null); setActiveAnnotationId(annotation.id); setAnnotationNote(annotation.note ?? ''); setAnnotationColor(annotation.color); }}><span>{annotation.quote}</span>{annotation.note && <small>{annotation.note}</small>}</button>)}</div>}
              {(pendingAnnotation || activeAnnotation) && <div className="qbank-annotation-editor">
                {pendingAnnotation && <p className="qbank-annotation-quote">“{pendingAnnotation.anchor.quote}”</p>}
                <label className="field"><span>{annotationCopy.note}</span><textarea rows={2} maxLength={1000} value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} placeholder={annotationCopy.placeholder}/></label>
                <div className="qbank-annotation-colors" role="group" aria-label="Highlight color">
                  {(['yellow','green','blue','pink','orange'] as const).map((color) => <button key={color} className={`qbank-color-choice annotation-${color}${annotationColor === color ? ' active' : ''}`} type="button" aria-label={`${annotationCopy.colors[color]} highlight`} title={annotationCopy.colors[color]} aria-pressed={annotationColor === color} disabled={annotationBusy} onClick={() => { setAnnotationColor(color); if (activeAnnotation) void updateActiveAnnotation({ color }); }}/>) }
                </div>
                <div className="qbank-annotation-actions">
                  {pendingAnnotation && <button className="btn btn-primary" type="button" disabled={annotationBusy} onClick={() => void saveNewAnnotation()}>{annotationBusy ? m.common.loading : annotationCopy.save}</button>}
                  {activeAnnotation && <><button className="btn btn-primary" type="button" disabled={annotationBusy || annotationNote === (activeAnnotation.note ?? '')} onClick={() => void updateActiveAnnotation({ note: annotationNote.trim() || null })}>{annotationBusy ? m.common.loading : annotationCopy.saveNote}</button><button className="btn" type="button" disabled={annotationBusy} onClick={() => void deleteActiveAnnotation()}>{annotationCopy.remove}</button></>}
                  <button className="btn" type="button" disabled={annotationBusy} onClick={() => { setPendingAnnotation(null); setActiveAnnotationId(null); setAnnotationNote(''); }}>{annotationCopy.cancel}</button>
                </div>
              </div>}
              {annotationError && <p className="qbank-annotation-error" role="status">{annotationError}</p>}
            </section>
            {hasAnswered && <section className="qbank-feedback" aria-label={feedbackCopy.rate}>
              <div className="qbank-rating-control"><span className="panel-title">{feedbackCopy.rate}</span><div className="qbank-rating-buttons" role="group" aria-label={feedbackCopy.rate}>{([1,2,3,4,5] as const).map((value) => <button key={value} className={`btn btn-sm${questionRating === value ? ' btn-primary' : ''}`} type="button" aria-label={`${value} / 5`} aria-pressed={questionRating === value} disabled={ratingBusy} onClick={() => void saveQuestionRating(value)}>{value}</button>)}</div></div>
              <button className="btn" type="button" disabled={reportSubmitted} onClick={() => setReportOpen((open) => !open)}>{reportSubmitted ? feedbackCopy.reportSent : feedbackCopy.report}</button>
              {feedbackMessage && <p className="qbank-feedback-message" role="status">{feedbackMessage}</p>}
              {reportOpen && <form className="qbank-report-form" onSubmit={(event) => void submitQuestionReport(event)}>
                <label className="field"><span>{feedbackCopy.category}</span><select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as IssueCategory)}>{(['incorrect_answer','typo','unclear','outdated','other'] as const).map((category) => <option key={category} value={category}>{feedbackCopy.categories[category]}</option>)}</select></label>
                <label className="field"><span>{feedbackCopy.message}</span><textarea maxLength={2000} rows={3} value={reportMessage} onChange={(event) => setReportMessage(event.target.value)} placeholder={feedbackCopy.placeholder}/></label>
                <small className="field-note">{feedbackCopy.noPatient}</small>
                <div className="qbank-feedback-actions"><button className="btn btn-primary" type="submit" disabled={reportBusy}>{reportBusy ? m.common.loading : feedbackCopy.submit}</button><button className="btn" type="button" disabled={reportBusy} onClick={() => setReportOpen(false)}>{feedbackCopy.cancel}</button></div>
              </form>}
            </section>}
            <textarea aria-label={m.qbank.note} value={note} onChange={(event) => setNote(event.target.value)} placeholder={m.qbank.notePlaceholder} />
            <div className="qbank-tool-row">
              <button className={`btn${flashcardStatus === 'saved' ? ' active' : ''}`} disabled={flashcardStatus === 'saving' || flashcardStatus === 'saved'} onClick={() => void createFlashcardFromQuestion()} type="button"><Icon name="cards" size={18}/>{flashcardStatus === 'saving' ? m.common.loading : flashcardStatus === 'saved' ? m.common.saved : m.qbank.addToFlashcards}</button>
              <button className={`btn${currentItem?.marked ? ' active' : ''}`} disabled={saving} onClick={() => toggleMark()} type="button"><Icon name="flag" size={18}/>{currentItem?.marked ? m.qbank.unmark : m.qbank.markForReview}</button>
              <button className={`btn${isSaved ? ' active' : ''}`} disabled={bookmarkBusy} aria-pressed={isSaved} onClick={() => void toggleSaved()} type="button"><Icon name="bookmark" size={18}/>{isSaved ? m.common.saved : m.common.save}</button>
              <button className="btn" disabled={!canSeeKeyTerms || question.key_terms.length === 0} onClick={() => setKeyVisible((visible) => !visible)} type="button"><Icon name="search" size={18}/>{m.qbank.keyTerms}</button>
            </div>
            {flashcardStatus === 'error' && <span className="panel-sub">{m.qbank.couldNotCreate}</span>}
            {keyVisible && canSeeKeyTerms && question.key_terms.length > 0 && <div className="key-terms">{question.key_terms.slice(0, 3).map((term) => <span key={term}>{term}</span>)}</div>}
            <div className="qbank-clinical-card">
              <div className="qbank-clinical-tabs" role="tablist" aria-label="Question learning information">
                <button id="qbank-tab-key-info" role="tab" aria-selected={infoTab === 'key-info'} aria-controls="qbank-panel-key-info" type="button" onClick={() => setInfoTab('key-info')}><Icon name="book" size={18}/>{clinicalCopy.keyInfo}</button>
                <button id="qbank-tab-attending-tip" role="tab" aria-selected={infoTab === 'attending-tip'} aria-controls="qbank-panel-attending-tip" type="button" onClick={() => setInfoTab('attending-tip')}><Icon name="spark" size={18}/>{clinicalCopy.attendingTip}</button>
                <button id="qbank-tab-labs" role="tab" aria-selected={infoTab === 'labs'} aria-controls="qbank-panel-labs" type="button" onClick={() => { setInfoTab('labs'); void loadLabs(); }}><Icon name="flask" size={18}/>{clinicalCopy.labs}</button>
              </div>
              <div className="qbank-clinical-panel" id={`qbank-panel-${infoTab}`} role="tabpanel" aria-labelledby={`qbank-tab-${infoTab}`}>
                {infoTab === 'key-info' && (hasAnswered && (question.explanation || question.key_learning_point) ? <div className="qbank-key-info">{question.explanation && <p><AnnotationText text={question.explanation} segmentKey="explanation" annotations={questionAnnotations}/></p>}{question.key_learning_point && <div className="learning-point"><b>{m.qbank.keyLearning}</b><span><AnnotationText text={question.key_learning_point} segmentKey="key_learning_point" annotations={questionAnnotations}/></span></div>}</div> : <div className="qbank-info-empty"><Icon name="book" size={19}/><span>{hasAnswered ? m.qbank.noQuestion : clinicalCopy.reviewAfterAnswer}</span></div>)}
                {infoTab === 'attending-tip' && <div className="qbank-info-empty"><Icon name="spark" size={19}/><span>{clinicalCopy.noTip}</span></div>}
                {infoTab === 'labs' && <div className="qbank-labs-panel">
                  <div className="lab-reference-note" role="note"><p><strong>{clinicalCopy.referenceRanges}.</strong> {clinicalCopy.referenceNote}</p></div>
                  {labsLoading && <p className="panel-sub" role="status">{m.common.loading}</p>}
                  {labsError && <div className="qbank-info-empty" role="alert"><Icon name="flask" size={19}/><span>{clinicalCopy.labsUnavailable}</span><button className="btn btn-sm" type="button" onClick={() => void loadLabs()}>{m.common.retry}</button></div>}
                  {labValues && (labValues.length ? <LabValuesBrowser values={labValues}/> : <div className="qbank-info-empty"><Icon name="flask" size={19}/><span>{clinicalCopy.labsUnavailable}</span></div>)}
                </div>}
              </div>
            </div>
            <nav className="qbank-card-navigation" aria-label={m.qbank.navigator}>
              <button className="btn" disabled={currentPosition <= 1 || saving} onClick={() => void load(currentPosition - 1)} type="button"><Icon name="chevron-left" size={17}/>{m.qbank.previous}</button>
              <div className="qbank-card-pages" aria-label={`${m.qbank.questionOf} ${currentPosition} / ${state.session.requested_count}`}>
                {state.items.filter((item) => state.items.length <= 9 || Math.abs(item.position - currentPosition) <= 3).map((item) => <button key={item.position} className={`qbank-page-dot${item.position === currentPosition ? ' current' : ''}${item.answered ? ' answered' : ''}`} aria-current={item.position === currentPosition ? 'step' : undefined} aria-label={`${m.qbank.questionOf} ${item.position}`} disabled={saving || (isExam && !state.session.previous_block_review_allowed && item.block !== state.session.current_block)} onClick={() => void load(item.position)} type="button">{item.position}</button>)}
              </div>
              <button className="btn btn-primary" disabled={isLast || saving} onClick={() => void load(currentPosition + 1)} type="button">{m.qbank.next}<Icon name="chevron-right" size={17}/></button>
            </nav>
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
      <footer className="qbank-session-footer">
        <div className="qbank-elapsed"><Icon name="clock" size={19}/><span>{timerCopy.elapsed}:&nbsp; {formatTime(elapsedSeconds)}</span></div>
        <div className="qbank-footer-actions">
          {!isExam && <button className="btn" disabled={breakBusy} onClick={() => void togglePracticePause()} type="button"><Icon name={state.session.on_break ? 'play' : 'pause'} size={17}/>{state.session.on_break ? timerCopy.resume : timerCopy.pause}</button>}
          <button className="btn qbank-danger-action" disabled={saving} onClick={() => setConfirmFinish(true)} type="button"><Icon name="logout" size={17}/>{m.qbank.finishSession}</button>
        </div>
      </footer>
      {confirmFinish && <div className="qbank-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmFinish(false); }}>
        <section className="card card-pad qbank-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="qbank-finish-title" aria-describedby="qbank-finish-description" onKeyDown={(event) => { if (event.key === 'Escape') setConfirmFinish(false); }}>
          <h2 id="qbank-finish-title">{m.qbank.finishSession}?</h2>
          <p id="qbank-finish-description">{confirmFinishCopy}</p>
          <div className="qbank-confirm-actions"><button className="btn" autoFocus type="button" onClick={() => setConfirmFinish(false)}>{m.qbank.previous}</button><button className="btn btn-primary" disabled={saving} type="button" onClick={() => { setConfirmFinish(false); void finish(); }}>{saving ? m.common.loading : m.qbank.finishSession}</button></div>
        </section>
      </div>}
    </main>
  );
}
