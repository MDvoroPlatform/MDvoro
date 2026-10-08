'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Exam = { id: string; code: string; name: string };
type Row = { rank: number; display_name: string; questions_solved: number; correct_answers: number; accuracy: number; study_days: number; xp_score: number; is_me: boolean };
type Period = 'week' | 'month' | 'all_time';
type Metric = 'questions' | 'accuracy' | 'xp' | 'days';

const copy = {
  en: { title:'Hall of Fame', sub:'Compete with the community. Your learning, your rules.', week:'7 days', month:'30 days', all:'All time', questions:'Questions', accuracy:'Accuracy', xp:'Study XP', days:'Study days', solved:'solved', anonymous:'Anonymous student', hide:'Hide my name', show:'Show my name', hidden:'Your name is hidden from the public leaderboard.', visible:'Your name is visible on the public leaderboard.', empty:'Be one of the first students on the board.', min:'Rankings require at least 5 answered questions.', you:'YOU', noExam:'Choose an exam to see its leaderboard.' },
  he: { title:'היכל המצטיינים', sub:'תחרות עם הקהילה. הלמידה שלך, לפי הכללים שלך.', week:'7 ימים', month:'30 ימים', all:'כל הזמנים', questions:'שאלות', accuracy:'דיוק', xp:'XP לימודי', days:'ימי לימוד', solved:'נפתרו', anonymous:'סטודנט אנונימי', hide:'הסתר את השם שלי', show:'הצג את השם שלי', hidden:'השם שלך מוסתר מהלוח הציבורי.', visible:'השם שלך מוצג בלוח הציבורי.', empty:'היה בין הראשונים בלוח.', min:'הדירוג דורש לפחות 5 שאלות שנענו.', you:'אתה', noExam:'בחר امتحان لرؤية لوحة الترتيب.' },
  ar: { title:'قاعة المتفوقين', sub:'نافس المجتمع — وتبقى خصوصيتك بيدك.', week:'7 أيام', month:'30 يومًا', all:'كل الوقت', questions:'الأسئلة', accuracy:'الدقة', xp:'XP الدراسة', days:'أيام الدراسة', solved:'محلولة', anonymous:'طالب مجهول', hide:'إخفاء اسمي', show:'إظهار اسمي', hidden:'اسمك مخفي عن لوحة المتصدرين.', visible:'اسمك ظاهر على لوحة المتصدرين.', empty:'كن من أوائل الطلاب في القائمة.', min:'يتطلب التصنيف حل 5 أسئلة على الأقل.', you:'أنت', noExam:'اختر امتحانًا لرؤية لوحة الترتيب.' },
  ru: { title:'Зал лучших', sub:'Соревнуйтесь с сообществом, сохраняя контроль над именем.', week:'7 дней', month:'30 дней', all:'За всё время', questions:'Вопросы', accuracy:'Точность', xp:'Учебный XP', days:'Дни учёбы', solved:'решено', anonymous:'Анонимный студент', hide:'Скрыть моё имя', show:'Показывать моё имя', hidden:'Ваше имя скрыто в публичном рейтинге.', visible:'Ваше имя видно в публичном рейтинге.', empty:'Станьте одним из первых в рейтинге.', min:'Для рейтинга нужно ответить минимум на 5 вопросов.', you:'ВЫ', noExam:'Выберите экзамен, чтобы увидеть рейтинг.' },
} as const;

export function Leaderboard({ exam, initialRows, initialVisible }: { exam: Exam | null; initialRows: Row[]; initialVisible: boolean }) {
  const locale = typeof document !== 'undefined' ? document.documentElement.lang?.slice(0,2) : 'en';
  const m = copy[(locale === 'he' || locale === 'ar' || locale === 'ru' ? locale : 'en') as keyof typeof copy];
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<Metric>('questions');
  const queryKey = exam ? `${exam.id}:${period}:${metric}` : '';
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [loadedKey, setLoadedKey] = useState(queryKey);
  const [visible, setVisible] = useState(initialVisible);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const loading = Boolean(queryKey && queryKey !== loadedKey);

  useEffect(() => {
    if (!exam) return;
    let active = true;
    Promise.resolve(supabase.rpc('public_leaderboard', { p_exam_id: exam.id, p_period: period, p_metric: metric, p_limit: 50 })).then(({ data, error }) => {
      if (!active) return;
      setLoadedKey(queryKey);
      if (error) { setLoadError(true); return; }
      setLoadError(false);
      setRows((data ?? []) as Row[]);
    }).catch(() => {
      if (!active) return;
      setLoadedKey(queryKey);
      setLoadError(true);
    });
    return () => { active = false; };
  }, [exam, metric, period, queryKey, supabase]);

  const toggleVisibility = async () => {
    setSaving(true);
    setSaveError(false);
    const next = !visible;
    const { data, error } = await supabase.rpc('set_leaderboard_visibility', { p_visible: next });
    if (error) setSaveError(true);
    else setVisible(Boolean(data));
    setSaving(false);
  };

  const podium = rows.slice(0,3);
  return <div className="page leaderboard-page">
    <div className="page-head leaderboard-head">
      <div><div className="eyebrow">MDvoro • Competition</div><h1>{m.title}</h1><p className="subtitle">{m.sub}</p></div>
      <div className="leaderboard-privacy"><span>{visible ? '●' : '○'}</span><button className="btn btn-sm" disabled={saving} onClick={toggleVisibility}>{saving ? '…' : (visible ? m.hide : m.show)}</button>{saveError && <small role="alert">Could not save privacy preference.</small>}</div>
    </div>
    {!exam ? <section className="card card-pad"><strong>{m.noExam}</strong></section> : <>
      <section className="leaderboard-hero card card-pad">
        <div><span className="kicker">{exam.code}</span><h2>{exam.name}</h2><p className="panel-sub">{visible ? m.visible : m.hidden}</p></div>
        <div className="leaderboard-controls">
          <div className="segmented">{([['week',m.week],['month',m.month],['all_time',m.all]] as const).map(([v,label])=><button key={v} className={period===v?'active':''} onClick={()=>setPeriod(v)}>{label}</button>)}</div>
          <div className="segmented">{([['questions',m.questions],['accuracy',m.accuracy],['xp',m.xp],['days',m.days]] as const).map(([v,label])=><button key={v} className={metric===v?'active':''} onClick={()=>setMetric(v)}>{label}</button>)}</div>
        </div>
      </section>
      {podium.length > 0 && <section className="leaderboard-podium">{podium.map((r) => <div key={r.rank} className={`podium-card rank-${r.rank}`}><span className="podium-rank">#{r.rank}</span><div className="podium-avatar">{r.rank===1?'★':r.rank===2?'◆':'▲'}</div><strong>{r.is_me ? `${r.display_name} · ${m.you}` : r.display_name}</strong><span>{r.questions_solved} {m.solved}</span><b>{r.accuracy}%</b></div>)}</section>}
      <section className="card leaderboard-table-card"><div className="leaderboard-table-head"><div><h2>{metric==='questions'?m.questions:metric==='accuracy'?m.accuracy:metric==='xp'?m.xp:m.days}</h2><p>{m.min}</p></div><span>{loading ? '…' : `${rows.length}`}</span></div>{loadError && <div className="card-pad" role="alert">Leaderboard could not be loaded. Please retry this view.</div>}<div className="leaderboard-table">{rows.map((r)=><div key={`${r.rank}-${r.display_name}`} className={`leaderboard-row ${r.is_me?'is-me':''}`}><strong className="leaderboard-rank">{r.rank}</strong><div className="leaderboard-person"><span className="leaderboard-avatar">{r.display_name.trim().slice(0,1).toUpperCase()}</span><span><b>{r.is_me ? `${r.display_name} · ${m.you}` : r.display_name}</b><small>{r.questions_solved} {m.solved} · {r.study_days} {m.days}</small></span></div><strong>{metric==='questions'?r.questions_solved:metric==='accuracy'?`${r.accuracy}%`:metric==='xp'?r.xp_score:r.study_days}</strong></div>)}</div>{rows.length===0 && <div className="leaderboard-empty">{m.empty}</div>}</section>
    </>}
  </div>;
}
