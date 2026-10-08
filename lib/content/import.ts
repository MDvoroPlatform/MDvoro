export type ImportOption = {
    id: string;
    text: string;
};
function splitCsvRow(row: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < row.length; i += 1) {
        const char = row[i];
        const next = row[i + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            i += 1;
            continue;
        }
        if (char === '"') {
            quoted = !quoted;
            continue;
        }
        if (char === ',' && !quoted) {
            cells.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}
export function csvToQuestionRows(csv: string): Record<string, unknown>[] {
    const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((row) => row.trim());
    if (rows.length < 2)
        return [];
    const headers = splitCsvRow(rows[0]).map((header) => header.trim());
    return rows.slice(1).map((row) => {
        const values = splitCsvRow(row);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
}
export function normalizeImportedQuestion(row: Record<string, unknown>): Record<string, unknown> {
    const optionIds = ['A', 'B', 'C', 'D', 'E'];
    const options = optionIds
        .map((id) => ({ id, text: String(row[`option_${id.toLowerCase()}`] ?? '').trim() }))
        .filter((option) => option.text);
    return {
        examId: String(row.examId ?? '').trim(),
        stem: String(row.stem ?? '').trim(),
        subject: String(row.subject ?? '').trim(),
        topic: String(row.topic ?? '').trim(),
        options,
        answerKey: String(row.answerKey ?? '').trim(),
        explanation: String(row.explanation ?? '').trim(),
        keyLearningPoint: String(row.keyLearningPoint ?? '').trim(),
        difficulty: Number(row.difficulty || 3),
        mediaIds: String(row.mediaIds ?? '').split(';').map((id) => id.trim()).filter(Boolean),
    };
}

