import clsx from 'clsx';
import {
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isThisYear,
  isToday,
  isYesterday,
} from 'date-fns';
import { getSticker } from './stickers';

export const cn = (...args) => clsx(...args);

const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Resolve server-relative media paths against the API origin when configured. */
export function mediaUrl(url) {
  if (!url) return null;
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  return `${API_ORIGIN}${url}`;
}

export function initials(name = '') {
  if (!name.trim()) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** A stable, pleasant gradient per user id so avatars feel personal. */
export function avatarGradient(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  const hue = hash;
  return `linear-gradient(135deg, hsl(${hue} 78% 62%), hsl(${(hue + 48) % 360} 76% 52%))`;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatCallDuration(seconds = 0) {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatTime(value) {
  if (!value) return '';
  return format(new Date(value), 'h:mm a');
}

export function formatChatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

export function formatDayLabel(value) {
  const date = new Date(value);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'EEEE, MMM d');
  return format(date, 'MMMM d, yyyy');
}

export function formatRelative(value) {
  if (!value) return '';
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function sameDay(a, b) {
  if (!a || !b) return false;
  return isSameDay(new Date(a), new Date(b));
}

export function presenceLabel(status, lastSeenAt) {
  if (status === 'online') return 'Online now';
  if (status === 'away') return 'Away';
  if (lastSeenAt) return `Last seen ${formatRelative(lastSeenAt)}`;
  return 'Offline';
}

export function messagePreview(message) {
  if (!message) return 'No messages yet';
  if (message.deletedAt) return 'Message deleted';
  if (message.type === 'image') return 'Photo';
  if (message.type === 'voice') return 'Voice message';
  if (message.type === 'file') return message.attachments?.[0]?.name || 'Attachment';
  if (message.type === 'sticker') {
    const sticker = getSticker(message.body);
    return sticker.unknown ? 'Sticker' : `Sticker: ${sticker.label}`;
  }
  return message.body?.slice(0, 160) || '';
}

export function isImageAttachment(attachment) {
  return /^image\//.test(attachment?.mimeType || '');
}

export function isAudioAttachment(attachment) {
  return /^audio\//.test(attachment?.mimeType || '');
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return (
    error?.response?.data?.error?.message ||
    error?.data?.error?.message ||
    error?.message ||
    fallback
  );
}

export function getErrorDetails(error) {
  return error?.response?.data?.error?.details ?? error?.data?.error?.details ?? null;
}

let audioContext = null;

function context() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

/** Soft UI chime synthesised with the Web Audio API — no asset dependency. */
export function playChime(kind = 'message') {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const notes =
    kind === 'call'
      ? [523.25, 659.25, 783.99]
      : kind === 'success'
        ? [659.25, 880]
        : [880, 1174.66];
  const now = ctx.currentTime;

  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const start = now + index * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.055, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.36);
  });
}

/** Looping two-tone ring used by incoming/outgoing call screens. */
export function startRingtone(mode = 'incoming') {
  const ctx = context();
  if (!ctx) return () => {};
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  let stopped = false;
  const pattern = mode === 'incoming' ? [0, 0.55] : [0];
  const frequencies = mode === 'incoming' ? [660, 880] : [440];

  function ring() {
    if (stopped) return;
    const now = ctx.currentTime;
    pattern.forEach((offset, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequencies[index % frequencies.length];
      const start = now + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.04, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.44);
    });
  }

  ring();
  const timer = setInterval(ring, mode === 'incoming' ? 2600 : 3200);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

export function scrollToBottom(element) {
  if (!element) return;
  element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitLinks(text = '') {
  return text.split(/(https?:\/\/[^\s]+)/g);
}
