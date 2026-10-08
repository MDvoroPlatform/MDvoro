import { describe, expect, it } from 'vitest';
import { csvToQuestionRows, normalizeImportedQuestion } from '@/lib/content/import';

describe('content import', () => {
  it('parses quoted CSV cells', () => {
    const rows = csvToQuestionRows('examId,stem,subject,option_a,option_b,answerKey\n1,"A, complex case",IM,A,B,A');
    expect(rows[0].stem).toBe('A, complex case');
  });

  it('normalizes option columns into the question contract', () => {
    const question = normalizeImportedQuestion({ examId: 'x', stem: 'A valid clinical question', subject: 'Medicine', option_a: 'A', option_b: 'B', answerKey: 'B' });
    expect(question.options).toEqual([{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }]);
    expect(question.answerKey).toBe('B');
  });
});
