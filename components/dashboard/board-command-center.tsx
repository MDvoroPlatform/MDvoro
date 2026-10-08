import Link from 'next/link';

export type BlueprintRow = { subject: string; available: number; attempted: number; correct: number; accuracy: number; coverage: number };
export type ActivityRow = { day: string; questions: number; correct: number; accuracy: number };
export type Mistakes = { total_wrong: number; high_confidence_wrong: number; low_confidence_wrong: number; slow_wrong: number };
export type BoardSnapshot = {
  learner_state?: string;
  today?: { attempts_today?: number; correct_today?: number };
  week?: { attempts_7d?: number; correct_7d?: number };
  streak_days?: number;
  due_cards?: number;
  plan?: { daily_questions?: number; days_remaining?: number | null; target_date?: string | null };
  recommendations?: { type?: string; title?: string; reason?: string; target_count?: number }[];
};

const copy = {
  en: {
    title: 'Board Success Center', sub: 'One place for today’s work, exam coverage, weak points, and the fastest next step.',
    today: 'Today', todaySub: 'Finish the smallest set that moves your readiness forward.',
    target: 'daily questions', cards: 'cards due', streak: 'day streak', days: 'days left',
    mission: 'Next best actions', missionSub: 'MDvoro prioritizes retrieval, mistakes, and unfinished daily work.',
    coverage: 'Exam coverage', coverageSub: 'Questions attempted versus the published exam pool by branch.',
    accuracy: 'accuracy', attempted: 'attempted', notStarted: 'Not started',
    mistakes: 'Mistake profile', mistakesSub: 'Turn avoidable mistakes into targeted practice.',
    totalWrong: 'wrong', highConf: 'high-confidence wrong', lowConf: 'low-confidence wrong', slow: 'slow wrong',
    activity: '14-day activity', activitySub: 'Consistency matters more than a single high-score session.',
    simulation: 'Full simulation', simulationSub: 'Run the official exam-sized configuration when your QBank has enough items.',
    simulationBtn: 'Start full simulation', plan: 'Open study plan', analytics: 'Open analytics', qbank: 'Practice now', flashcards: 'Review due cards',
    note: 'MDvoro measures preparation signals from your activity. It does not guarantee a pass or predict an official score.'
  },
  he: {
    title: 'מרכז הצלחה לבחינה', sub: 'מקום אחד למשימות היום, כיסוי הבחינה, נקודות חולשה והצעד הבא.',
    today: 'היום', todaySub: 'השלם את המינימום שמקדם את המוכנות שלך.', target: 'שאלות יומיות', cards: 'כרטיסיות לתרגול', streak: 'ימי רצף', days: 'ימים לבחינה',
    mission: 'הפעולות הבאות', missionSub: 'MDvoro נותן עדיפות לשליפה, טעויות ומשימות יומיות שלא הושלמו.', coverage: 'כיסוי הבחינה', coverageSub: 'שאלות שנפתרו מתוך המאגר שפורסם לפי ענף.', accuracy: 'דיוק', attempted: 'נפתרו', notStarted: 'טרם התחיל', mistakes: 'פרופיל טעויות', mistakesSub: 'הפוך טעויות שניתן למנוע לתרגול ממוקד.', totalWrong: 'טעויות', highConf: 'טעות עם ביטחון גבוה', lowConf: 'טעות עם ביטחון נמוך', slow: 'טעות איטית', activity: 'פעילות ב-14 ימים', activitySub: 'עקביות חשובה יותר מסשן אחד עם ציון גבוה.', simulation: 'סימולציה מלאה', simulationSub: 'הפעל תצורה בגודל הבחינה כאשר קיים מספיק תוכן.', simulationBtn: 'התחל סימולציה מלאה', plan: 'פתח תוכנית לימוד', analytics: 'פתח אנליטיקה', qbank: 'תרגל עכשיו', flashcards: 'תרגל כרטיסיות', note: 'MDvoro מודד אותות מוכנות מהפעילות שלך. הוא אינו מבטיח מעבר ואינו מנבא ציון רשמי.'
  },
  ar: {
    title: 'مركز نجاح البورد', sub: 'مكان واحد لمهام اليوم وتغطية الامتحان ونقاط الضعف والخطوة التالية.', today: 'اليوم', todaySub: 'أكمل أصغر مجموعة تدفع جاهزيتك إلى الأمام.', target: 'أسئلة يومية', cards: 'بطاقات مستحقة', streak: 'أيام متتالية', days: 'أيام متبقية', mission: 'أفضل الخطوات التالية', missionSub: 'MDvoro يعطي الأولوية للاسترجاع والأخطاء والمهام غير المكتملة.', coverage: 'تغطية الامتحان', coverageSub: 'الأسئلة التي حُلّت مقارنة بالمخزون المنشور حسب الفرع.', accuracy: 'الدقة', attempted: 'تم حلها', notStarted: 'لم يبدأ', mistakes: 'ملف الأخطاء', mistakesSub: 'حوّل الأخطاء القابلة للتجنب إلى تدريب موجّه.', totalWrong: 'أخطاء', highConf: 'خطأ مع ثقة عالية', lowConf: 'خطأ مع ثقة منخفضة', slow: 'خطأ بطيء', activity: 'نشاط آخر 14 يومًا', activitySub: 'الاستمرارية أهم من جلسة واحدة بنتيجة عالية.', simulation: 'محاكاة كاملة', simulationSub: 'شغّل إعدادًا بحجم الامتحان عندما يتوفر عدد كافٍ من الأسئلة.', simulationBtn: 'ابدأ المحاكاة الكاملة', plan: 'افتح خطة الدراسة', analytics: 'افتح التحليلات', qbank: 'تدرّب الآن', flashcards: 'راجع البطاقات', note: 'MDvoro يقيس إشارات الاستعداد من نشاطك. لا يضمن النجاح ولا يتنبأ بدرجة رسمية.'
  },
  ru: {
    title: 'Центр успеха на экзамене', sub: 'Один экран для задач дня, охвата экзамена, слабых мест и следующего действия.', today: 'Сегодня', todaySub: 'Выполните минимум, который реально повышает готовность.', target: 'вопросов в день', cards: 'карточек к повторению', streak: 'дней подряд', days: 'дней осталось', mission: 'Следующие лучшие действия', missionSub: 'MDvoro ставит в приоритет повторение, ошибки и незавершённую дневную цель.', coverage: 'Охват экзамена', coverageSub: 'Решённые вопросы относительно опубликованного пула по дисциплинам.', accuracy: 'точность', attempted: 'решено', notStarted: 'Не начато', mistakes: 'Профиль ошибок', mistakesSub: 'Превращайте предотвратимые ошибки в точечную практику.', totalWrong: 'ошибок', highConf: 'ошибка при высокой уверенности', lowConf: 'ошибка при низкой уверенности', slow: 'медленная ошибка', activity: 'Активность за 14 дней', activitySub: 'Стабильность важнее одной удачной сессии.', simulation: 'Полная симуляция', simulationSub: 'Запустите конфигурацию размера экзамена, когда в QBank достаточно вопросов.', simulationBtn: 'Запустить полную симуляцию', plan: 'Открыть план', analytics: 'Открыть аналитику', qbank: 'Практиковаться', flashcards: 'Повторить карточки', note: 'MDvoro измеряет сигналы подготовки по вашей активности. Он не гарантирует сдачу и не предсказывает официальный балл.'
  }
} as const;

export function BoardCommandCenter({ locale, snapshot, blueprint, activity, mistakes, examId, fullExamCap }: {
  locale: 'en'|'he'|'ar'|'ru'; snapshot: BoardSnapshot | null; blueprint: BlueprintRow[]; activity: ActivityRow[]; mistakes: Mistakes | null; examId: string | null; fullExamCap: number | null;
}) {
  const t = copy[locale];
  const dailyTarget = snapshot?.plan?.daily_questions ?? 40;
  const today = snapshot?.today?.attempts_today ?? 0;
  const due = snapshot?.due_cards ?? 0;
  const daysLeft = snapshot?.plan?.days_remaining;
  const targetProgress = Math.min(100, Math.round((today / Math.max(1, dailyTarget)) * 100));
  const maxQuestions = fullExamCap && fullExamCap > 0 ? fullExamCap : 210;
  return <section className="board-command-center">
    <div className="card card-pad board-command-hero">
      <div className="panel-head"><div><div className="eyebrow">MDvoro</div><div className="panel-title">{t.title}</div><div className="panel-sub">{t.sub}</div></div><div className="board-command-actions"><Link className="btn btn-primary" href={examId ? { pathname: '/qbank', query: { examId } } : '/qbank'}>{t.qbank}</Link>{due > 0 && <Link className="btn" href="/flashcards">{t.flashcards} · {due}</Link>}</div></div>
      <div className="board-progress"><div className="board-progress-head"><strong>{t.today}</strong><span>{today}/{dailyTarget} {t.target}</span></div><div className="progress-track"><span style={{ width: `${targetProgress}%` }} /></div></div>
      <div className="grid grid-4 board-mini-stats"><div><b>{dailyTarget}</b><span>{t.target}</span></div><div><b>{due}</b><span>{t.cards}</span></div><div><b>{snapshot?.streak_days ?? 0}</b><span>{t.streak}</span></div><div><b>{daysLeft ?? '—'}</b><span>{t.days}</span></div></div>
    </div>

    <div className="grid grid-main board-command-grid">
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{t.mission}</div><div className="panel-sub">{t.missionSub}</div></div></div>{snapshot?.recommendations?.length ? <div className="today-mission">{snapshot.recommendations.slice(0,4).map((r,idx) => <div className="today-mission-row" key={`${r.type}-${idx}`}><div><span className="kicker">{idx + 1}</span><strong>{r.title}</strong><small>{r.reason}</small></div><Link className="btn btn-sm" href={r.type === 'flashcards' ? '/flashcards' : { pathname: '/qbank', query: { ...(examId ? { examId } : {}), pool: r.type === 'qbank' && String(r.title).toLowerCase().includes('weak') ? 'incorrect' : 'mixed' } }}>{r.type === 'flashcards' ? t.flashcards : t.qbank}</Link></div>)}</div> : <p className="panel-sub">{t.todaySub}</p>}</section>
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{t.simulation}</div><div className="panel-sub">{t.simulationSub}</div></div></div><div className="simulation-tile"><strong>{examId ? maxQuestions : '—'}</strong><span>exam-sized questions</span>{examId && <Link className="btn btn-primary" href={`/qbank?examId=${encodeURIComponent(examId)}&full=1`}>{t.simulationBtn}</Link>}</div><div className="result-review-actions compact-actions"><Link className="btn" href="/study-plan">{t.plan}</Link><Link className="btn" href="/analytics">{t.analytics}</Link></div></section>
    </div>

    <div className="grid grid-main board-command-grid">
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{t.coverage}</div><div className="panel-sub">{t.coverageSub}</div></div></div><div className="board-blueprint">{blueprint.length ? blueprint.map(row => <div className="board-blueprint-row" key={row.subject}><div className="board-blueprint-label"><b>{row.subject}</b><small>{row.attempted} {t.attempted} · {row.accuracy}% {t.accuracy}</small></div><div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(0, row.coverage))}%` }} /></div><strong>{Math.round(row.coverage)}%</strong></div>) : <p className="panel-sub">{t.notStarted}</p>}</div></section>
      <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{t.mistakes}</div><div className="panel-sub">{t.mistakesSub}</div></div></div>{mistakes ? <div className="mistake-grid"><div><b>{mistakes.total_wrong}</b><span>{t.totalWrong}</span></div><div><b>{mistakes.high_confidence_wrong}</b><span>{t.highConf}</span></div><div><b>{mistakes.low_confidence_wrong}</b><span>{t.lowConf}</span></div><div><b>{mistakes.slow_wrong}</b><span>{t.slow}</span></div></div> : <p className="panel-sub">{t.notStarted}</p>}</section>
    </div>

    <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">{t.activity}</div><div className="panel-sub">{t.activitySub}</div></div></div><div className="activity-bars">{activity.map(row => <div className="activity-bar" key={row.day} title={`${row.questions} Q · ${row.accuracy}%`}><span style={{ height: `${Math.max(8, Math.min(100, row.questions * 4))}%` }} /><small>{row.day.slice(5)}</small></div>)}</div><p className="form-hint">{t.note}</p></section>
  </section>;
}
