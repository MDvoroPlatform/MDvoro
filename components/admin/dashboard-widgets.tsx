import Link from 'next/link';

type Question = {
  id: string;
  subject: string | null;
  topic: string | null;
  updated_at: string;
};

const palette = ['#2780f5', '#16b89a', '#f7a83c', '#9257e8', '#eb5b8b', '#6879bd'];

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
}

export function DashboardWidgets({ questions }: { questions: Question[] }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { key: `${month.getFullYear()}-${month.getMonth()}`, label: monthLabel(month), count: 0 };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));
  const subjects = new Map<string, number>();
  for (const question of questions) {
    const updated = new Date(question.updated_at);
    const month = monthMap.get(`${updated.getFullYear()}-${updated.getMonth()}`);
    if (month) month.count += 1;
    const subject = question.subject?.trim() || 'Unclassified';
    subjects.set(subject, (subjects.get(subject) ?? 0) + 1);
  }
  const orderedSubjects = [...subjects].sort((a, b) => b[1] - a[1]);
  const topSubjects = orderedSubjects.slice(0, 5);
  const otherCount = orderedSubjects.slice(5).reduce((total, entry) => total + entry[1], 0);
  if (otherCount) topSubjects.push(['Other', otherCount]);
  const subjectTotal = topSubjects.reduce((total, entry) => total + entry[1], 0);
  let angle = 0;
  const gradient = topSubjects.length ? `conic-gradient(${topSubjects.map(([, count], index) => {
    const start = angle;
    angle += subjectTotal ? (count / subjectTotal) * 360 : 0;
    return `${palette[index % palette.length]} ${start}deg ${angle}deg`;
  }).join(', ')})` : 'conic-gradient(#eaf0f8 0deg 360deg)';
  const maxMonthCount = Math.max(1, ...months.map((month) => month.count));

  return <div className="admin-widget-grid">
    <section className="card card-pad admin-chart-card" aria-labelledby="admin-activity-title">
      <div className="panel-head"><div><div id="admin-activity-title" className="panel-title">Question activity</div><div className="panel-sub">Updated questions in the latest 100 records · last 6 months</div></div><Link className="muted-link" href="/admin/questions">View all</Link></div>
      {questions.length ? <div className="activity-chart" role="img" aria-label={`Question updates by month: ${months.map((month) => `${month.label} ${month.count}`).join(', ')}`}>
        <div className="activity-y-axis"><span>{maxMonthCount}</span><span>{Math.ceil(maxMonthCount / 2)}</span><span>0</span></div>
        <div className="activity-bars">{months.map((month) => <div className="activity-bar-column" key={month.key}><div className="activity-bar-track"><span className="activity-bar" style={{ height: `${Math.max(month.count ? 6 : 0, (month.count / maxMonthCount) * 100)}%` }} title={`${month.count} updates`} /></div><small>{month.label}</small><b>{month.count}</b></div>)}</div>
      </div> : <div className="widget-empty">No question activity is available yet.</div>}
    </section>
    <section className="card card-pad admin-chart-card" aria-labelledby="admin-subject-title">
      <div className="panel-head"><div><div id="admin-subject-title" className="panel-title">Questions by subject</div><div className="panel-sub">Distribution in the latest {questions.length} records</div></div></div>
      {subjectTotal ? <div className="subject-chart-layout"><div className="subject-donut" style={{ background: gradient }} role="img" aria-label={`Subject distribution among ${subjectTotal} recent questions`}><span><b>{subjectTotal}</b><small>Records</small></span></div><ul className="subject-legend">{topSubjects.map(([subject, count], index) => <li key={subject}><i style={{ background: palette[index % palette.length] }}/><span title={subject}>{subject}</span><b>{count}</b><small>{Math.round((count / subjectTotal) * 100)}%</small></li>)}</ul></div> : <div className="widget-empty">Subject distribution will appear when questions are available.</div>}
    </section>
  </div>;
}
