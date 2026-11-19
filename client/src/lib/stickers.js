/**
 * Curated sticker pack. Stickers are identified by a stable id so messages
 * stay small, searchable, and render the same for everyone without uploads.
 */
export const STICKERS = [
  { id: 'wave', emoji: '👋', label: 'Wave', tint: 'violet' },
  { id: 'smile', emoji: '😄', label: 'Smile', tint: 'amber' },
  { id: 'laugh', emoji: '😂', label: 'Laugh', tint: 'amber' },
  { id: 'wink', emoji: '😉', label: 'Wink', tint: 'violet' },
  { id: 'cool', emoji: '😎', label: 'Cool', tint: 'aqua' },
  { id: 'wow', emoji: '😮', label: 'Wow', tint: 'violet' },
  { id: 'sad', emoji: '😢', label: 'Sad', tint: 'aqua' },
  { id: 'cry', emoji: '😭', label: 'Crying', tint: 'aqua' },
  { id: 'angry', emoji: '😡', label: 'Angry', tint: 'coral' },
  { id: 'think', emoji: '🤔', label: 'Thinking', tint: 'violet' },
  { id: 'heart', emoji: '❤️', label: 'Heart', tint: 'rose' },
  { id: 'love', emoji: '🥰', label: 'Love', tint: 'rose' },
  { id: 'thumbsup', emoji: '👍', label: 'Thumbs up', tint: 'amber' },
  { id: 'clap', emoji: '👏', label: 'Clap', tint: 'amber' },
  { id: 'pray', emoji: '🙏', label: 'Thanks', tint: 'violet' },
  { id: 'yes', emoji: '✅', label: 'Yes', tint: 'aqua' },
  { id: 'no', emoji: '❌', label: 'No', tint: 'coral' },
  { id: 'fire', emoji: '🔥', label: 'Fire', tint: 'coral' },
  { id: 'party', emoji: '🎉', label: 'Party', tint: 'rose' },
  { id: 'gift', emoji: '🎁', label: 'Gift', tint: 'rose' },
  { id: 'star', emoji: '⭐', label: 'Star', tint: 'amber' },
  { id: 'coffee', emoji: '☕', label: 'Coffee', tint: 'violet' },
  { id: 'music', emoji: '🎵', label: 'Music', tint: 'aqua' },
  { id: 'cat', emoji: '🐱', label: 'Cat', tint: 'coral' },
];

const byId = new Map(STICKERS.map((sticker) => [sticker.id, sticker]));

/** Resolve a stored sticker id, with a safe tile for ids from older clients. */
export function getSticker(id) {
  return (
    byId.get(id) ?? {
      id,
      emoji: '✨',
      label: 'Sticker',
      tint: 'violet',
      unknown: true,
    }
  );
}
