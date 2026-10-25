export type AnnotationAnchor = {
  quote: string;
  prefix: string;
  suffix: string;
  start_offset: number;
  end_offset: number;
};

export type TextRange = { start: number; end: number };

const CONTEXT_LENGTH = 64;

export function createTextAnchor(text: string, start: number, end: number): AnnotationAnchor | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return null;
  const quote = text.slice(start, end);
  if (!quote.trim() || quote.length > 2000) return null;
  return {
    quote,
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, Math.min(text.length, end + CONTEXT_LENGTH)),
    start_offset: start,
    end_offset: end,
  };
}

function commonSuffixLength(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[left.length - 1 - length] === right[right.length - 1 - length]) length += 1;
  return length;
}

function commonPrefixLength(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

export function resolveTextAnchor(text: string, anchor: AnnotationAnchor): TextRange | null {
  if (!anchor.quote || anchor.quote.length > 2000) return null;
  const { start_offset: preferredStart, end_offset: preferredEnd } = anchor;
  if (preferredStart >= 0 && preferredEnd <= text.length && text.slice(preferredStart, preferredEnd) === anchor.quote) {
    return { start: preferredStart, end: preferredEnd };
  }

  const candidates: { start: number; end: number; score: number }[] = [];
  let from = 0;
  while (from <= text.length - anchor.quote.length) {
    const start = text.indexOf(anchor.quote, from);
    if (start < 0) break;
    const end = start + anchor.quote.length;
    const prefix = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const suffix = text.slice(end, end + anchor.suffix.length);
    candidates.push({
      start,
      end,
      score: commonSuffixLength(anchor.prefix, prefix) + commonPrefixLength(anchor.suffix, suffix),
    });
    from = start + 1;
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || Math.abs(a.start - preferredStart) - Math.abs(b.start - preferredStart));
  const first = candidates[0];
  const second = candidates[1];
  if (first.score < 6 || (second && second.score === first.score && Math.abs(first.start - preferredStart) === Math.abs(second.start - preferredStart))) return null;
  return { start: first.start, end: first.end };
}
