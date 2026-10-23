export type QuestionPoolCount = {
  available: number | string | null;
  attempted: number | string | null;
};

export type QuestionProgress = {
  total: number;
  answered: number;
  percentage: number;
};

function asCount(value: number | string | null): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

/** Sum per-subject counts from learning_exam_blueprint into exam-wide totals. */
export function calculateQuestionProgress(rows: QuestionPoolCount[]): QuestionProgress {
  const total = rows.reduce((sum, row) => sum + asCount(row.available), 0);
  const answered = Math.min(total, rows.reduce((sum, row) => sum + asCount(row.attempted), 0));
  const percentage = total === 0 ? 0 : Math.min(100, Math.round((answered / total) * 100));

  return { total, answered, percentage };
}
