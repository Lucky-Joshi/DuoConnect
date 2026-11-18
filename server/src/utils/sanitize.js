// eslint-disable-next-line no-control-regex -- deliberately strips control characters from user text
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value, { maxLength = 4000, allowNewlines = true } = {}) {
  if (typeof value !== 'string') return '';
  let text = value.replace(CONTROL_CHARS, '');
  if (!allowNewlines) text = text.replace(/[\r\n\t]+/g, ' ');
  text = text.trim();
  return text.slice(0, maxLength);
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

export function directKey(userA, userB) {
  return [userA, userB].sort().join(':');
}

export function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}
