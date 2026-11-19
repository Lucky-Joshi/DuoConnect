import { describe, expect, it } from 'vitest';
import { firstLinkIn } from './linkPreview';

describe('link preview extraction', () => {
  it('finds the first URL and trims trailing punctuation', () => {
    expect(firstLinkIn('see https://example.com/a and https://example.org/b')).toBe(
      'https://example.com/a',
    );
    expect(firstLinkIn('wow: https://example.com/story.')).toBe('https://example.com/story');
    expect(firstLinkIn('(https://example.com/x)')).toBe('https://example.com/x');
  });

  it('returns null when a message has no web link', () => {
    expect(firstLinkIn('just a normal message')).toBeNull();
    expect(firstLinkIn('')).toBeNull();
  });
});
