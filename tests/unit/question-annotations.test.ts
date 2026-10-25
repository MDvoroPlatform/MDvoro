import { describe, expect, it } from 'vitest';
import { createTextAnchor, resolveTextAnchor } from '@/lib/qbank/annotation-anchor';

describe('private QBank annotation anchors', () => {
  it('creates a quote with surrounding context and restores its range', () => {
    const text = 'The ECG shows peaked T waves and a prolonged interval.';
    const start = text.indexOf('peaked T waves');
    const anchor = createTextAnchor(text, start, start + 'peaked T waves'.length);
    expect(anchor?.quote).toBe('peaked T waves');
    expect(resolveTextAnchor(text, anchor!)).toEqual({ start, end: start + 14 });
  });

  it('uses context to resolve repeated phrases after text is inserted before them', () => {
    const original = 'A finding: peaked T waves. Another finding: peaked T waves.';
    const targetStart = original.lastIndexOf('peaked T waves');
    const anchor = createTextAnchor(original, targetStart, targetStart + 14)!;
    const updated = `Updated history. ${original}`;
    const restored = resolveTextAnchor(updated, anchor);
    expect(restored).toEqual({ start: updated.lastIndexOf('peaked T waves'), end: updated.lastIndexOf('peaked T waves') + 14 });
  });

  it('preserves right-to-left text and JavaScript UTF-16 offsets', () => {
    const text = 'علامة سريرية مهمة';
    const start = text.indexOf('سريرية');
    const anchor = createTextAnchor(text, start, start + 'سريرية'.length)!;
    expect(resolveTextAnchor(text, anchor)).toEqual({ start, end: start + 'سريرية'.length });

    const emojiText = 'α 😀 finding';
    const emojiStart = emojiText.indexOf('😀');
    const emoji = createTextAnchor(emojiText, emojiStart, emojiStart + '😀'.length)!;
    expect(emoji.end_offset - emoji.start_offset).toBe(2);
    expect(resolveTextAnchor(emojiText, emoji)).toEqual({ start: emojiStart, end: emojiStart + 2 });
  });

  it('does not attach a quote that no longer exists', () => {
    const text = 'Hyperkalemia may cause peaked T waves.';
    const start = text.indexOf('peaked T waves');
    const anchor = createTextAnchor(text, start, start + 'peaked T waves'.length)!;
    expect(resolveTextAnchor('Hyperkalemia may cause a prolonged PR interval.', anchor)).toBeNull();
  });
});
