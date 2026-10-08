import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getI18n } from '@/lib/i18n/server';

type Result = {
  session: {
    id: string;
    exam_id: string;
    exam_code: string;
    exam_name: string;
    mode: string;
    status: string;
    requested_count: number;
    answered_count: number;
    correct_count: number;
    score_percent: number | null;
    duration_seconds: number;
    marked_count: number;
    note_count: number;
  };
  breakdown: { subject: string; total: number; correct: number; incorrect: number; unanswered: number; accuracy: number }[];
  topic_breakdown: { topic: string; total: number; correct: number; incorrect: number; unanswered: number; accuracy: number }[];
  items: {
    position: number;
    question_id: string;
    content_code: string;
    subject: string;
    topic: string | null;
    stem: string;
    options: { id: string; text: string }[];
    selected_answer: string | null;
    is_correct: boolean | null;
    duration_ms: number | null;
    marked: boolean;
    note: string;
    correct_answer: string | null;
    explanation: string | null;
    key_terms: string[];
    key_learning_point: string | null;
  }[];
};

export default async function QBankResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { messages: m } = await getI18n();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('study_session_result', { p_session_id: sessionId });
  if (error || !data) notFound();

  const result = data as Result;
  const session = result.session;
  const incorrectCount = session.answered_count - session.correct_count;
  const unansweredCount = session.requested_count - session.answered_count;
  const orderedItems = [...result.items].sort((a, b) => a.position - b.position);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {session.exam_code} · {session.mode === 'exam' ? m.qbank.examMode : m.qbank.practiceMode}
          </div>
          <h1>{m.qbank.resultsTitle}</h1>
          <p className="subtitle">{session.exam_name}</p>
        </div>
        <div className="result-head-actions">
          <Link className="btn" href="/qbank/history">{m.qbank.history}</Link>
          <Link className="btn btn-primary" href="/qbank">{m.qbank.newSession}</Link>
        </div>
      </div>

      <div className="result-hero grid grid-4">
        <div className="card card-pad">
          <span className="metric-label">{m.qbank.score}</span>
          <strong className="metric-value">{session.score_percent ?? 0}%</strong>
          <small>{session.correct_count}/{session.requested_count} {m.qbank.correctAnswers}</small>
        </div>
        <div className="card card-pad">
          <span className="metric-label">{m.qbank.answered}</span>
          <strong className="metric-value">{session.answered_count}</strong>
          <small>{m.qbank.of} {session.requested_count}</small>
        </div>
        <div className="card card-pad">
          <span className="metric-label">{m.qbank.incorrect}</span>
          <strong className="metric-value">{incorrectCount}</strong>
          <small>{m.qbank.reviewMistakes}</small>
        </div>
        <div className="card card-pad">
          <span className="metric-label">{m.qbank.unanswered}</span>
          <strong className="metric-value">{unansweredCount}</strong>
          <small>{m.qbank.completeLater}</small>
        </div>
      </div>

      <div className="card card-pad result-summary-strip">
        <span><strong>{m.qbank.realTime}:</strong> {new Date(session.duration_seconds * 1000).toISOString().slice(11, 19)}</span>
        <span><strong>{m.qbank.marked}:</strong> {session.marked_count}</span>
        <span><strong>{m.qbank.note}:</strong> {session.note_count}</span>
      </div>

      <section className="card card-pad result-section">
        <div className="panel-head">
          <div>
            <div className="panel-title">{m.qbank.subjectBreakdown}</div>
            <div className="panel-sub">{m.qbank.subjectBreakdownDesc}</div>
          </div>
        </div>
        <div className="breakdown-list">
          {result.breakdown.map((branch) => (
            <div className="breakdown-row" key={branch.subject}>
              <div className="breakdown-label">
                <strong>{branch.subject}</strong>
                <span>{branch.correct}/{branch.total} · {branch.accuracy}%</span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${Math.min(100, Math.max(0, branch.accuracy))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad result-section">
        <div className="panel-head">
          <div>
            <div className="panel-title">{m.qbank.resultsTitle} · {m.qbank.subjectBreakdown}</div>
            <div className="panel-sub">{m.qbank.subjectBreakdownDesc}</div>
          </div>
        </div>
        <div className="result-bar-chart" role="img" aria-label={m.qbank.subjectBreakdown}>
          {result.topic_breakdown.slice(0, 12).map((topic) => (
            <div className="result-bar-row" key={topic.topic}>
              <div className="result-bar-label"><span>{topic.topic}</span><strong>{topic.accuracy}%</strong></div>
              <div className="result-bar-track"><span style={{ width: `${Math.max(0, Math.min(100, topic.accuracy))}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad result-section">
        <div className="panel-head">
          <div>
            <div className="panel-title">{m.qbank.questionReview}</div>
            <div className="panel-sub">{m.qbank.questionReviewDesc}</div>
          </div>
        </div>
        <div className="result-review-list">
          {orderedItems.map((item) => (
            <article
              className={`result-review-card ${item.is_correct === true ? 'correct' : item.is_correct === false ? 'incorrect' : 'unanswered'}`}
              id={`q-${item.position}`}
              key={item.position}
            >
              <div className="result-review-head">
                <div>
                  <span className="result-q-number">{item.position}</span>{' '}
                  <strong>{item.content_code}</strong>{' '}
                  <small>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</small>
                </div>
                <span>
                  {item.is_correct === true ? m.qbank.correct : item.is_correct === false ? m.qbank.incorrect : m.qbank.unanswered}
                </span>
              </div>

              <p className="question-stem result-stem">{item.stem}</p>

              <div className="result-options">
                {item.options.map((option) => {
                  const isSelected = option.id === item.selected_answer;
                  const isCorrect = option.id === item.correct_answer;
                  return (
                    <div
                      className={`result-option ${isCorrect ? 'correct' : ''} ${isSelected && !isCorrect ? 'selected-wrong' : ''}`}
                      key={option.id}
                    >
                      <b>{option.id}</b>
                      <span>{option.text}</span>
                      {isCorrect ? <em>{m.qbank.correct}</em> : isSelected ? <em>{m.qbank.yourAnswer}</em> : null}
                    </div>
                  );
                })}
              </div>

              {item.explanation && (
                <div className="answer-result result-explanation">
                  <strong>{m.qbank.explanation}</strong>
                  <p>{item.explanation}</p>
                </div>
              )}
              {item.key_learning_point && (
                <div className="learning-point">
                  <b>{m.qbank.keyLearning}</b>
                  <span>{item.key_learning_point}</span>
                </div>
              )}
              {item.key_terms.length > 0 && (
                <div className="key-terms">
                  {item.key_terms.slice(0, 3).map((term) => <span key={term}>{term}</span>)}
                </div>
              )}
              {item.note && <div className="form-hint">{m.qbank.note}: {item.note}</div>}
            </article>
          ))}
        </div>
      </section>

      <section className="result-review-actions">
        <Link className="btn btn-primary" href={`/qbank?examId=${encodeURIComponent(session.exam_id)}&pool=incorrect`}>{m.qbank.practiceMistakes}</Link>
        <Link className="btn" href={`/qbank?examId=${encodeURIComponent(session.exam_id)}&pool=unanswered`}>{m.qbank.practiceUnanswered}</Link>
        <Link className="btn" href={`/qbank?examId=${encodeURIComponent(session.exam_id)}&pool=unseen`}>{m.qbank.poolUnseen}</Link>
        <Link className="btn" href={`/qbank?examId=${encodeURIComponent(session.exam_id)}&pool=bookmarked`}>{m.qbank.poolBookmarked}</Link>
        <Link className="btn" href={`/qbank?examId=${encodeURIComponent(session.exam_id)}&pool=answered`}>{m.qbank.poolAnswered}</Link>
        <Link className="btn" href="/analytics">{m.qbank.viewAnalytics}</Link>
      </section>
    </div>
  );
}
