'use client';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/provider';
import { learnerStateLabel, type SmartSnapshot } from '@/lib/learning/rules';
const copy = {
    en: { title: 'MDvoro Smart Mentor', sub: 'Rules-based guidance — no AI required', state: 'Learning state', today: 'Today', accuracy: 'Accuracy', streak: 'Streak', due: 'Due cards', next: 'Next best actions', empty: 'Start a few questions and the system will build your personal learning model.', qbank: 'Practice', cards: 'Review cards' },
    he: { title: 'המנטור החכם של MDvoro', sub: 'הכוונה מבוססת כללים — ללא AI', state: 'מצב למידה', today: 'היום', accuracy: 'דיוק', streak: 'רצף', due: 'כרטיסיות לתרגול', next: 'הפעולות המומלצות', empty: 'ענה על כמה שאלות והמערכת תבנה את מודל הלמידה האישי שלך.', qbank: 'תרגול', cards: 'חזרה' },
    ar: { title: 'المرشد الذكي من MDvoro', sub: 'إرشاد قائم على القواعد — بدون AI', state: 'حالة التعلم', today: 'اليوم', accuracy: 'الدقة', streak: 'التتابع', due: 'بطاقات مستحقة', next: 'أفضل الخطوات التالية', empty: 'حل بعض الأسئلة وسيبني النظام نموذج التعلم الشخصي الخاص بك.', qbank: 'تدريب', cards: 'مراجعة البطاقات' },
    ru: { title: 'Умный наставник MDvoro', sub: 'Правила и данные — без AI', state: 'Состояние обучения', today: 'Сегодня', accuracy: 'Точность', streak: 'Серия', due: 'Карточек к повторению', next: 'Следующие действия', empty: 'Решите несколько вопросов, и система построит вашу персональную модель обучения.', qbank: 'Практика', cards: 'Повторение' },
} as const;
export function SmartMentor({ snapshot }: {
    snapshot: SmartSnapshot | null;
}) {
    const { locale } = useI18n();
    const t = copy[locale];
    if (!snapshot)
        return <section className="card card-pad smart-mentor"><div className="panel-head"><div><div className="panel-title">{t.title}</div><div className="panel-sub">{t.sub}</div></div></div><p className="panel-sub">{t.empty}</p></section>;
    return <section className="card card-pad smart-mentor">
    <div className="panel-head"><div><div className="panel-title">{t.title}</div><div className="panel-sub">{t.sub}</div></div><span className="status-chip">{snapshot.ai_enabled ? 'AI' : 'Rules'}</span></div>
    <div className="smart-metrics"><div><span>{t.state}</span><strong>{learnerStateLabel(snapshot.learner_state)}</strong></div><div><span>{t.accuracy}</span><strong>{snapshot.overall.accuracy}%</strong></div><div><span>{t.streak}</span><strong>{snapshot.streak_days}d</strong></div><div><span>{t.due}</span><strong>{snapshot.due_cards}</strong></div></div>
    <div className="panel-head smart-next-head"><div className="panel-title">{t.next}</div></div>
    <div className="smart-actions">{snapshot.recommendations.slice(0, 4).map((r, i) => <div className="smart-action" key={`${r.type}-${i}`}><div><b>{r.title}</b><p>{r.reason}</p></div><Link className="btn btn-sm" href={r.type === 'flashcards' ? '/flashcards' : '/qbank'}>{r.type === 'flashcards' ? t.cards : t.qbank}</Link></div>)}</div>
  </section>;
}

