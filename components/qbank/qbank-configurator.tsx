'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';
import { getDisciplineSelectionState, toggleDisciplineSelection, toggleTopicSelection } from '@/lib/qbank/builder-selection';

type Exam = { id: string; code: string; name: string };
type Pool = 'mixed' | 'unseen' | 'incorrect' | 'answered' | 'unanswered' | 'bookmarked';
type Status = 'all' | 'unanswered' | 'incorrect' | 'saved' | 'notes';
type Source = { id: string; key: string; name: string; kind: string; count: number; children: Source[] };
type Topic = { id: string; name: string; count: number; isOthers: boolean };
type Discipline = { value: string; label: string; count: number; topics: Topic[] };
type Tree = { sources: Source[]; disciplines: Discipline[]; available: number };
type Catalog = { exam: { product_max_items?: number; official_max_items?: number; max_items?: number; block_max_items: number; block_duration_minutes: number; block_count: number; total_duration_minutes: number; timing_verified?: boolean } };
type Filters = {
  allSources: boolean;
  sourceIds: string[];
  allDisciplines: boolean;
  fullSubjects: string[];
  topicIds: string[];
  status: Status;
  difficulties: number[];
  mode: 'practice' | 'exam';
  questionCount: number;
};

const copy = {
  en: { exam: 'Exam', basic: 'Basic settings', source: 'Sources', disciplines: 'Disciplines and topics', advanced: 'Advanced settings', all: 'All', none: 'Clear selection', selected: 'selected', allSources: 'All sources', allDisciplines: 'All disciplines', chooseExam: 'Choose an exam', mode: 'Mode', practice: 'Practice', examMode: 'Exam mode', status: 'Question status', difficulty: 'Difficulty', questionCount: 'Number of questions', easy: 'Easy', medium: 'Medium', hard: 'Hard', allStatus: 'All questions', unanswered: 'Unanswered', incorrect: 'Incorrect', saved: 'Saved / marked', notes: 'With notes', search: 'Search disciplines and topics', available: 'Available', start: 'Start session', loading: 'Loading filters…', loadingExam: 'Loading exam data…', noSources: 'No sources available for this exam yet.', noDisciplines: 'No disciplines are configured for this exam yet.', noQuestions: 'There are no questions for this selection.', loadError: 'Could not load the filter list. Try again.', reset: 'Reset', max: 'Maximum', minQuestion: 'Minimum 1 question', selectTopic: 'Select topic', expand: 'Expand', collapse: 'Collapse', statusAll: 'Use all eligible questions', startError: 'Could not start the session. Please try again.', insufficient: 'There are not enough matching questions for this number.', examLimit: 'This number is above the exam limit.', timer: 'Estimated time', untimed: 'No forced timer', min: 'min', questions: 'questions', countSummary: 'questions available' },
  ar: { exam: 'الامتحان', basic: 'الإعدادات الأساسية', source: 'المصادر', disciplines: 'التخصصات والمواضيع', advanced: 'إعدادات متقدمة', all: 'الكل', none: 'مسح الاختيار', selected: 'محدد', allSources: 'كل المصادر', allDisciplines: 'كل التخصصات', chooseExam: 'اختر امتحانًا', mode: 'النمط', practice: 'تدريب', examMode: 'نمط الامتحان', status: 'حالة السؤال', difficulty: 'الصعوبة', questionCount: 'عدد الأسئلة', easy: 'سهل', medium: 'متوسط', hard: 'صعب', allStatus: 'كل الأسئلة', unanswered: 'غير مجابة', incorrect: 'أُجيب عنها خطأ', saved: 'محفوظة / معلّمة', notes: 'لها ملاحظات', search: 'ابحث في التخصصات والمواضيع', available: 'المتاح', start: 'ابدأ الجلسة', loading: 'جارٍ تحميل المرشحات…', loadingExam: 'جارٍ تحميل بيانات الامتحان…', noSources: 'لا توجد مصادر مضافة لهذا الامتحان بعد.', noDisciplines: 'لا توجد تخصصات مهيأة لهذا الامتحان بعد.', noQuestions: 'لا توجد أسئلة مطابقة لهذا الاختيار.', loadError: 'تعذر تحميل المرشحات. حاول مرة أخرى.', reset: 'إعادة ضبط', max: 'الحد الأقصى', minQuestion: 'سؤال واحد على الأقل', selectTopic: 'اختر الموضوع', expand: 'توسيع', collapse: 'طي', statusAll: 'استخدم كل الأسئلة المطابقة', startError: 'تعذر بدء الجلسة. حاول مرة أخرى.', insufficient: 'عدد الأسئلة المطابقة أقل من العدد المطلوب.', examLimit: 'العدد يتجاوز حد الامتحان.', timer: 'الوقت التقديري', untimed: 'دون مؤقت إلزامي', min: 'دقيقة', questions: 'أسئلة', countSummary: 'سؤال متاح' },
  he: { exam: 'בחינה', basic: 'הגדרות בסיסיות', source: 'מקורות', disciplines: 'תחומים ונושאים', advanced: 'הגדרות מתקדמות', all: 'הכול', none: 'נקה בחירה', selected: 'נבחרו', allSources: 'כל המקורות', allDisciplines: 'כל התחומים', chooseExam: 'בחירת בחינה', mode: 'מצב', practice: 'תרגול', examMode: 'מצב בחינה', status: 'מצב השאלה', difficulty: 'רמת קושי', questionCount: 'מספר שאלות', easy: 'קל', medium: 'בינוני', hard: 'קשה', allStatus: 'כל השאלות', unanswered: 'ללא מענה', incorrect: 'שגויות', saved: 'שמורות / מסומנות', notes: 'עם הערות', search: 'חיפוש בתחומים ובנושאים', available: 'זמינות', start: 'התחלת מפגש', loading: 'טוען מסננים…', loadingExam: 'טוען נתוני בחינה…', noSources: 'אין עדיין מקורות לבחינה זו.', noDisciplines: 'אין עדיין תחומים שהוגדרו לבחינה זו.', noQuestions: 'אין שאלות לבחירה זו.', loadError: 'לא ניתן לטעון את המסננים. נסו שוב.', reset: 'איפוס', max: 'מקסימום', minQuestion: 'לפחות שאלה אחת', selectTopic: 'בחירת נושא', expand: 'הרחבה', collapse: 'צמצום', statusAll: 'כל השאלות המתאימות', startError: 'לא ניתן להתחיל את המפגש. נסו שוב.', insufficient: 'אין מספיק שאלות מתאימות למספר הזה.', examLimit: 'המספר חורג ממגבלת הבחינה.', timer: 'זמן משוער', untimed: 'ללא טיימר מחייב', min: 'דקות', questions: 'שאלות', countSummary: 'שאלות זמינות' },
  ru: { exam: 'Экзамен', basic: 'Основные настройки', source: 'Источники', disciplines: 'Дисциплины и темы', advanced: 'Дополнительные настройки', all: 'Все', none: 'Сбросить выбор', selected: 'выбрано', allSources: 'Все источники', allDisciplines: 'Все дисциплины', chooseExam: 'Выбрать экзамен', mode: 'Режим', practice: 'Практика', examMode: 'Режим экзамена', status: 'Статус вопроса', difficulty: 'Сложность', questionCount: 'Количество вопросов', easy: 'Легко', medium: 'Средне', hard: 'Сложно', allStatus: 'Все вопросы', unanswered: 'Без ответа', incorrect: 'С ошибками', saved: 'Сохранённые / отмеченные', notes: 'С заметками', search: 'Поиск по дисциплинам и темам', available: 'Доступно', start: 'Начать сессию', loading: 'Загрузка фильтров…', loadingExam: 'Загрузка данных экзамена…', noSources: 'Для этого экзамена пока нет источников.', noDisciplines: 'Для этого экзамена пока не настроены дисциплины.', noQuestions: 'Для этого выбора нет вопросов.', loadError: 'Не удалось загрузить фильтры. Повторите попытку.', reset: 'Сбросить', max: 'Максимум', minQuestion: 'Минимум 1 вопрос', selectTopic: 'Выбрать тему', expand: 'Развернуть', collapse: 'Свернуть', statusAll: 'Все подходящие вопросы', startError: 'Не удалось начать сессию. Повторите попытку.', insufficient: 'Подходящих вопросов меньше, чем указано.', examLimit: 'Количество превышает лимит экзамена.', timer: 'Примерное время', untimed: 'Без обязательного таймера', min: 'мин', questions: 'вопросов', countSummary: 'доступных вопросов' },
} as const;

const emptyFilters = (questionCount = 20): Filters => ({ allSources: true, sourceIds: [], allDisciplines: true, fullSubjects: [], topicIds: [], status: 'all', difficulties: [], mode: 'practice', questionCount });

export function QBankConfigurator({ exams, currentExamId, initialPool, initialExamId, fullExam = false }: { exams: Exam[]; currentExamId?: string | null; initialPool?: Pool; initialExamId?: string | null; fullExam?: boolean }) {
  const { messages: m, locale } = useI18n();
  const router = useRouter();
  const t = copy[(locale in copy ? locale : 'en') as keyof typeof copy];
  const defaultStatus: Status = initialPool === 'incorrect' ? 'incorrect' : initialPool === 'unanswered' || initialPool === 'unseen' ? 'unanswered' : initialPool === 'bookmarked' ? 'saved' : 'all';
  const [examId, setExamId] = useState(initialExamId ?? currentExamId ?? exams[0]?.id ?? '');
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters(), mode: fullExam ? 'exam' : 'practice', status: defaultStatus }));
  const [loadedExam, setLoadedExam] = useState('');
  const [tree, setTree] = useState<Tree | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<string[]>([]);
  const [expandedDisciplines, setExpandedDisciplines] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const maxCount = Math.max(1, Math.min(300, catalog?.exam.product_max_items ?? catalog?.exam.max_items ?? 300, filters.mode === 'exam' ? catalog?.exam.official_max_items ?? catalog?.exam.max_items ?? 300 : 300));
  const available = tree?.available ?? 0;
  const effectiveCount = Math.max(1, Math.min(filters.questionCount, maxCount, available || maxCount));
  const treePayload = useMemo(() => ({
    examId, allSources: filters.allSources, sourceIds: filters.sourceIds,
    allDisciplines: filters.allDisciplines, fullSubjects: filters.fullSubjects,
    topicIds: filters.topicIds, otherSubjects: [], status: filters.status,
    difficulties: filters.difficulties,
  }), [examId, filters.allSources, filters.sourceIds, filters.allDisciplines, filters.fullSubjects, filters.topicIds, filters.status, filters.difficulties]);

  useEffect(() => {
    if (!examId) return;
    setLoadedExam('');
    setTree(null);
    setCatalog(null);
    setLoadError(false);
    let saved: Partial<Filters> | null = null;
    try {
      const raw = localStorage.getItem(`qbank-session-builder:${examId}`);
      const stored = raw ? JSON.parse(raw) as Partial<Filters> & { version?: number } : null;
      saved = stored?.version === 2 ? stored : null;
    } catch { saved = null; }
    const defaults = emptyFilters();
    setFilters({
      ...defaults,
      ...(saved && Array.isArray(saved.sourceIds) && Array.isArray(saved.fullSubjects) && Array.isArray(saved.topicIds) && Array.isArray(saved.difficulties) ? saved : {}),
      mode: fullExam ? 'exam' : saved?.mode === 'exam' ? 'exam' : 'practice',
      status: saved?.status && ['all', 'unanswered', 'incorrect', 'saved', 'notes'].includes(saved.status) ? saved.status : filters.status,
      questionCount: typeof saved?.questionCount === 'number' ? saved.questionCount : filters.questionCount,
    } as Filters);
    setLoadedExam(examId);
  // Preferences are intentionally restored only when the selected exam changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, fullExam, defaultStatus]);

  useEffect(() => {
    if (!examId || loadedExam !== examId) return;
    try { localStorage.setItem(`qbank-session-builder:${examId}`, JSON.stringify({ version: 2, ...filters })); } catch { /* Storage can be disabled by the browser. */ }
  }, [examId, filters, loadedExam]);

  useEffect(() => {
    if (!examId || loadedExam !== examId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch('/api/qbank/builder/tree', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(treePayload), signal: controller.signal, cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Tree>; }),
      fetch(`/api/qbank/catalog?examId=${encodeURIComponent(examId)}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Catalog>; }),
    ]).then(([nextTree, nextCatalog]) => {
      setTree(nextTree);
      setCatalog(nextCatalog);
      setFilters(current => current.questionCount > nextTree.available && nextTree.available > 0 ? { ...current, questionCount: nextTree.available } : current);
    }).catch(error => {
      if (error?.name !== 'AbortError') setLoadError(true);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [examId, loadedExam, treePayload]);

  const update = (change: Partial<Filters>) => { setMessage(''); setFilters(current => ({ ...current, ...change })); };
  const sourceLeaves = (source: Source) => source.children.length ? source.children.map(child => child.id) : [source.id];
  const isSourceSelected = (source: Source, parent?: Source) => filters.allSources || filters.sourceIds.includes(source.id) || Boolean(parent && filters.sourceIds.includes(parent.id));
  const toggleParentSource = (source: Source) => {
    if (filters.allSources) {
      const ids = (tree?.sources ?? []).filter(row => row.id !== source.id).map(row => row.id);
      update({ allSources: false, sourceIds: ids });
      return;
    }
    const ids = [...filters.sourceIds];
    const descendants = sourceLeaves(source);
    if (ids.includes(source.id) || descendants.every(id => ids.includes(id))) {
      update({ sourceIds: ids.filter(id => id !== source.id && !descendants.includes(id)) });
    } else {
      update({ sourceIds: [...ids.filter(id => !descendants.includes(id)), source.id] });
    }
  };
  const toggleChildSource = (parent: Source, child: Source) => {
    let ids = [...filters.sourceIds];
    if (filters.allSources) {
      ids = (tree?.sources ?? []).map(row => row.id).filter(id => id !== parent.id);
      ids.push(...sourceLeaves(parent).filter(id => id !== child.id));
      update({ allSources: false, sourceIds: ids });
      return;
    }
    if (ids.includes(parent.id)) ids = [...ids.filter(id => id !== parent.id), ...sourceLeaves(parent)];
    update({ sourceIds: ids.includes(child.id) ? ids.filter(id => id !== child.id) : [...ids, child.id] });
  };
  const toggleDiscipline = (discipline: Discipline) => {
    const next = toggleDisciplineSelection({ all: filters.allDisciplines, subjects: filters.fullSubjects, topicIds: filters.topicIds }, discipline.value, tree?.disciplines ?? []);
    update({ allDisciplines: next.all, fullSubjects: next.subjects, topicIds: next.topicIds });
  };
  const toggleTopic = (discipline: Discipline, topic: Topic) => {
    if (topic.count === 0) return;
    const next = toggleTopicSelection({ all: filters.allDisciplines, subjects: filters.fullSubjects, topicIds: filters.topicIds }, discipline.value, topic.id, tree?.disciplines ?? []);
    update({ allDisciplines: next.all, fullSubjects: next.subjects, topicIds: next.topicIds });
  };
  const disciplineChecked = (discipline: Discipline) => getDisciplineSelectionState({ all: filters.allDisciplines, subjects: filters.fullSubjects, topicIds: filters.topicIds }, discipline).checked;
  const disciplinePartial = (discipline: Discipline) => getDisciplineSelectionState({ all: filters.allDisciplines, subjects: filters.fullSubjects, topicIds: filters.topicIds }, discipline).partial;
  const topicChecked = (discipline: Discipline, topic: Topic) => filters.allDisciplines || filters.fullSubjects.includes(discipline.value) || filters.topicIds.includes(topic.id);
  const filteredDisciplines = useMemo(() => {
    const query = topicSearch.trim().toLocaleLowerCase();
    if (!query) return tree?.disciplines ?? [];
    return (tree?.disciplines ?? []).map(discipline => ({
      ...discipline,
      topics: discipline.topics.filter(topic => topic.name.toLocaleLowerCase().includes(query)),
    })).filter(discipline => discipline.label.toLocaleLowerCase().includes(query) || discipline.topics.length > 0);
  }, [tree, topicSearch]);
  useEffect(() => {
    if (topicSearch.trim()) setExpandedDisciplines(filteredDisciplines.slice(0, 1).map(discipline => discipline.value));
  }, [topicSearch, filteredDisciplines]);
  const disciplineDisplayName = (discipline: Discipline) => {
    if (locale !== 'ar') return discipline.label;
    const arabicNames: Record<string, string> = {
      'Internal Medicine': 'الطب الباطني',
      Pediatrics: 'طب الأطفال',
      Surgery: 'الجراحة',
      Psychiatry: 'الطب النفسي',
      'Obstetrics & Gynecology': 'التوليد وأمراض النساء',
    };
    const arabic = arabicNames[discipline.label];
    return arabic ? `${arabic} (${discipline.label})` : discipline.label;
  };
  const statusLabel = { all: t.allStatus, unanswered: t.unanswered, incorrect: t.incorrect, saved: t.saved, notes: t.notes }[filters.status];
  const sourceSummary = filters.allSources ? t.allSources : `${filters.sourceIds.length} ${t.selected}`;
  const disciplineSummary = filters.allDisciplines ? t.allDisciplines : `${filters.fullSubjects.length + filters.topicIds.length} ${t.selected}`;
  const estimatedMinutes = catalog ? Math.max(1, Math.ceil(effectiveCount / Math.max(1, catalog.exam.block_max_items)) * catalog.exam.block_duration_minutes) : 0;

  async function startSession() {
    setMessage('');
    if (!examId || !tree || available < 1) return;
    if (effectiveCount > available) { setMessage(t.insufficient); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/qbank/builder/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        examId, allSources: filters.allSources, sourceIds: filters.sourceIds,
        allDisciplines: filters.allDisciplines, fullSubjects: filters.fullSubjects,
        topicIds: filters.topicIds, otherSubjects: [], status: filters.status,
        difficulties: filters.difficulties, questionCount: effectiveCount, mode: filters.mode,
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error === 'insufficient_questions' ? t.insufficient : body.error === 'exam_question_limit' ? t.examLimit : body.error === 'account_inactive' ? m.settings.accountSuspended : t.startError);
        return;
      }
      router.push(`/qbank/session/${body.sessionId}`);
    } catch { setMessage(t.startError); }
    finally { setBusy(false); }
  }

  function reset() {
    setFilters(emptyFilters());
    setTopicSearch('');
    setExpandedSources([]);
    setExpandedDisciplines([]);
    setMessage('');
    try { localStorage.removeItem(`qbank-session-builder:${examId}`); } catch { /* Storage can be disabled by the browser. */ }
  }

  const section = (id: string, title: string, summary: string, content: ReactNode) => <section className={`qbank-builder-section card ${openPanel === id ? 'is-open' : ''}`} key={id}>
    <button type="button" className="qbank-builder-trigger" aria-expanded={openPanel === id} onClick={() => setOpenPanel(current => current === id ? null : id)}>
      <span className="qbank-builder-trigger-copy"><strong>{title}</strong><small>{summary}</small></span>
      <Icon name="chevron-right" size={18} />
    </button>
    {openPanel === id && <div className="qbank-builder-panel">{content}</div>}
  </section>;

  return <div className="qbank-session-builder">
    {section('exam', t.exam, exams.find(exam => exam.id === examId)?.name ?? t.chooseExam, <label className="qbank-builder-field"><span>{t.chooseExam}</span><select value={examId} onChange={event => { setExamId(event.target.value); setTopicSearch(''); setExpandedDisciplines([]); setOpenPanel('disciplines'); }}>
      {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.code} — {exam.name}</option>)}
    </select></label>)}
    {section('basic', t.basic, `${filters.mode === 'practice' ? t.practice : t.examMode} · ${t.questionCount}: ${effectiveCount}`, <div className="qbank-basic-panel">
      <div className="qbank-setting"><span className="qbank-setting-label">{t.mode}</span><div className="qbank-segmented" role="group" aria-label={t.mode}>
        <button type="button" className={filters.mode === 'practice' ? 'active' : ''} aria-pressed={filters.mode === 'practice'} onClick={() => update({ mode: 'practice' })}>{t.practice}</button>
        <button type="button" className={filters.mode === 'exam' ? 'active' : ''} aria-pressed={filters.mode === 'exam'} onClick={() => update({ mode: 'exam' })}>{t.examMode}</button>
      </div></div>
    </div>)}
    {section('source', t.source, sourceSummary, <div className="qbank-tree-list">
      <label className="qbank-choice qbank-select-all"><input type="checkbox" checked={filters.allSources} onChange={event => update({ allSources: event.target.checked, sourceIds: [] })} /><span>{t.allSources}</span><small>{tree?.available ?? 0}</small></label>
      {loading && <div className="qbank-filter-state" role="status">{t.loading}</div>}
      {!loading && !tree?.sources.length && <div className="qbank-filter-state">{t.noSources}</div>}
      {(tree?.sources ?? []).map(source => <div className="qbank-source-group" key={source.id}>
        <div className="qbank-tree-row">
          <label className="qbank-choice"><input type="checkbox" checked={isSourceSelected(source)} onChange={() => toggleParentSource(source)} /><span>{source.name}</span><small>{source.count}</small></label>
          {source.children.length > 0 && <button className="qbank-expand-button" type="button" aria-expanded={expandedSources.includes(source.id)} aria-label={`${expandedSources.includes(source.id) ? t.collapse : t.expand} ${source.name}`} onClick={() => setExpandedSources(current => current.includes(source.id) ? current.filter(id => id !== source.id) : [...current, source.id])}>{expandedSources.includes(source.id) ? '−' : '+'}</button>}
        </div>
        {expandedSources.includes(source.id) && source.children.length > 0 && <div className="qbank-tree-children">{source.children.map(child => <label className="qbank-choice" key={child.id}><input type="checkbox" checked={isSourceSelected(child, source)} onChange={() => toggleChildSource(source, child)} /><span>{child.name}</span><small>{child.count}</small></label>)}</div>}
      </div>)}
      {loadError && <div className="qbank-filter-state error" role="alert">{t.loadError}</div>}
    </div>)}
    {section('disciplines', t.disciplines, disciplineSummary, <div className="qbank-tree-list">
      <div className="qbank-tree-actions"><label className="qbank-choice qbank-select-all"><input type="checkbox" checked={filters.allDisciplines} onChange={event => update({ allDisciplines: event.target.checked, fullSubjects: [], topicIds: [] })} /><span>{t.allDisciplines}</span></label><button type="button" onClick={() => update({ allDisciplines: false, fullSubjects: [], topicIds: [] })}>{t.none}</button></div>
      <label className="qbank-topic-search"><span className="sr-only">{t.search}</span><input type="search" value={topicSearch} onChange={event => setTopicSearch(event.target.value)} placeholder={t.search} /></label>
      {loading && <div className="qbank-filter-state" role="status">{t.loading}</div>}
      {!loading && !filteredDisciplines.length && <div className="qbank-filter-state">{t.noDisciplines}</div>}
      {filteredDisciplines.map(discipline => <div className="qbank-source-group" key={discipline.value}>
        <div className="qbank-tree-row">
          <label className="qbank-choice"><input type="checkbox" checked={disciplineChecked(discipline)} aria-checked={disciplinePartial(discipline) ? 'mixed' : disciplineChecked(discipline)} onChange={() => toggleDiscipline(discipline)} /><span><bdi>{disciplineDisplayName(discipline)}</bdi></span><small>{discipline.count}</small></label>
          {discipline.topics.length > 0 && <button className="qbank-expand-button" type="button" aria-expanded={expandedDisciplines.includes(discipline.value)} aria-label={`${expandedDisciplines.includes(discipline.value) ? t.collapse : t.expand} ${disciplineDisplayName(discipline)}`} onClick={() => setExpandedDisciplines(current => current.includes(discipline.value) ? [] : [discipline.value])}>{expandedDisciplines.includes(discipline.value) ? '−' : '+'}</button>}
        </div>
        {expandedDisciplines.includes(discipline.value) && discipline.topics.length > 0 && <div className="qbank-tree-children">{discipline.topics.map(topic => <label className={`qbank-choice ${topic.count === 0 ? 'is-empty' : ''}`} key={topic.id}>
          <input type="checkbox" checked={topicChecked(discipline, topic)} disabled={topic.count === 0} onChange={() => toggleTopic(discipline, topic)} />
          <span>{topic.name}</span><small>{topic.count}</small>
        </label>)}</div>}
      </div>)}
      {loadError && <div className="qbank-filter-state error" role="alert">{t.loadError}</div>}
    </div>)}
    {section('advanced', t.advanced, `${statusLabel}${filters.difficulties.length ? ` · ${filters.difficulties.length} ${t.selected}` : ''}`, <div className="qbank-advanced-panel">
      <fieldset className="qbank-setting"><legend className="qbank-setting-label">{t.status}</legend><div className="qbank-chip-options">{(['all', 'unanswered', 'incorrect', 'saved', 'notes'] as Status[]).map(status => <button type="button" key={status} className={filters.status === status ? 'active' : ''} aria-pressed={filters.status === status} onClick={() => update({ status })}>{({ all: t.allStatus, unanswered: t.unanswered, incorrect: t.incorrect, saved: t.saved, notes: t.notes })[status]}</button>)}</div></fieldset>
      <fieldset className="qbank-setting"><legend className="qbank-setting-label">{t.difficulty}</legend><div className="qbank-chip-options">{([{ values: [1, 2], label: t.easy }, { values: [3], label: t.medium }, { values: [4, 5], label: t.hard }] as const).map(item => { const selected = item.values.every(value => filters.difficulties.includes(value)); return <button type="button" key={item.label} className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => update({ difficulties: selected ? filters.difficulties.filter(value => !item.values.includes(value as never)) : [...new Set([...filters.difficulties, ...item.values])] })}>{item.label}</button>; })}</div><small className="qbank-field-note">{t.minQuestion}</small></fieldset>
      <button type="button" className="btn qbank-reset" onClick={reset}>{t.reset}</button>
    </div>)}
    {loadError && <div className="form-message error" role="alert">{t.loadError}</div>}
    {message && <div className="form-message error" role="alert">{message}</div>}
    {!loading && tree && available === 0 && <div className="qbank-empty-state" role="status">{t.noQuestions}</div>}
    <div className="qbank-sticky-footer">
      <div className="qbank-available"><span>{t.available}</span><strong>{loading ? '—' : available}</strong></div>
      <label className="qbank-count-control"><span>{t.questionCount}</span><input type="number" min={1} max={Math.min(maxCount, available || maxCount)} value={effectiveCount} disabled={available === 0 || loading} onChange={event => update({ questionCount: Math.max(1, Math.min(Math.min(maxCount, available || maxCount), Number(event.target.value) || 1)) })} /></label>
      {filters.mode === 'exam' && <span className="qbank-time-estimate">{catalog?.exam.timing_verified && effectiveCount >= (catalog.exam.official_max_items ?? catalog.exam.max_items ?? Number.MAX_SAFE_INTEGER) ? `${catalog.exam.total_duration_minutes} ${t.min}` : `${t.timer}: ${estimatedMinutes} ${t.min}`}</span>}
      {filters.mode === 'practice' && <span className="qbank-time-estimate">{t.untimed}</span>}
      <button type="button" className="btn btn-primary qbank-start-button" disabled={busy || loading || loadError || available === 0 || effectiveCount > available} onClick={() => void startSession()}>{busy ? t.loading : t.start}</button>
    </div>
  </div>;
}
