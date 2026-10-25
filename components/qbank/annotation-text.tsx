import { Fragment, type ReactNode } from 'react';
import { resolveTextAnchor } from '@/lib/qbank/annotation-anchor';

export type QuestionAnnotation = {
  id: string;
  question_id: string;
  segment_key: string;
  quote: string;
  prefix: string;
  suffix: string;
  start_offset: number;
  end_offset: number;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'orange';
  note: string | null;
  anchor_version: number;
};

const visibleRanges = (text: string, annotations: QuestionAnnotation[]) => annotations
  .map((annotation) => ({ annotation, range: resolveTextAnchor(text, annotation) }))
  .filter((entry): entry is { annotation: QuestionAnnotation; range: { start: number; end: number } } => entry.range !== null)
  .sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end)
  .reduce<{ annotation: QuestionAnnotation; range: { start: number; end: number } }[]>((ranges, entry) => {
    const previous = ranges.at(-1);
    if (!previous || entry.range.start >= previous.range.end) ranges.push(entry);
    return ranges;
  }, []);

export function AnnotationText({ text, segmentKey, annotations }: {
  text: string;
  segmentKey: string;
  annotations: QuestionAnnotation[];
}) {
  const ranges = visibleRanges(text, annotations.filter((annotation) => annotation.segment_key === segmentKey));
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const { annotation, range } of ranges) {
    if (range.start > cursor) pieces.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor, range.start)}</Fragment>);
    pieces.push(<mark className={`qbank-annotation-mark annotation-${annotation.color}`} key={annotation.id} title={annotation.note || undefined}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  }
  if (cursor < text.length || pieces.length === 0) pieces.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor)}</Fragment>);
  return <span data-annotation-segment={segmentKey}>{pieces}</span>;
}
