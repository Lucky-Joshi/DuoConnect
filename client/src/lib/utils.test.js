import { describe, expect, it } from 'vitest';
import {
  avatarGradient,
  formatBytes,
  formatCallDuration,
  formatDuration,
  initials,
  isAudioAttachment,
  isImageAttachment,
  mediaUrl,
  messagePreview,
  presenceLabel,
  splitLinks,
} from './utils';

describe('formatting helpers', () => {
  it('builds initials from up to two name parts', () => {
    expect(initials('Maya Chen')).toBe('MC');
    expect(initials('  sam ')).toBe('S');
    expect(initials('')).toBe('?');
  });

  it('formats byte sizes without long decimals', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('formats durations for messages and calls', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3720)).toBe('1h 2m');
    expect(formatCallDuration(65)).toBe('01:05');
  });

  it('returns a stable gradient for the same seed', () => {
    expect(avatarGradient('user-1')).toBe(avatarGradient('user-1'));
    expect(avatarGradient('user-1')).toMatch(/^linear-gradient\(135deg, hsl\(/);
  });
});

describe('message previews', () => {
  it('describes tombstones and media without leaking bodies', () => {
    expect(messagePreview(null)).toBe('No messages yet');
    expect(messagePreview({ deletedAt: 'now', body: 'secret' })).toBe('Message deleted');
    expect(messagePreview({ type: 'image' })).toBe('Photo');
    expect(messagePreview({ type: 'voice' })).toBe('Voice message');
    expect(messagePreview({ type: 'file', attachments: [{ name: 'brief.pdf' }] })).toBe(
      'brief.pdf',
    );
    expect(messagePreview({ type: 'text', body: 'Hello there' })).toBe('Hello there');
  });

  it('detects attachment media types', () => {
    expect(isImageAttachment({ mimeType: 'image/png' })).toBe(true);
    expect(isImageAttachment({ mimeType: 'application/pdf' })).toBe(false);
    expect(isAudioAttachment({ mimeType: 'audio/webm' })).toBe(true);
    expect(isAudioAttachment({ mimeType: 'video/webm' })).toBe(false);
  });
});

describe('url and presence helpers', () => {
  it('keeps absolute and blob URLs intact', () => {
    expect(mediaUrl('')).toBeNull();
    expect(mediaUrl('/uploads/a.png')).toBe('/uploads/a.png');
    expect(mediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(mediaUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  it('describes presence states', () => {
    expect(presenceLabel('online')).toBe('Online now');
    expect(presenceLabel('away')).toBe('Away');
    expect(presenceLabel('offline')).toBe('Offline');
  });

  it('splits links from plain text', () => {
    expect(splitLinks('see https://duoconnect.app now')).toEqual([
      'see ',
      'https://duoconnect.app',
      ' now',
    ]);
  });
});
