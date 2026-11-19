/** Built-in animated GIF pack. No external API or upload is required. */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const IDS = [
  ['wave', 'Wave'],
  ['heart', 'Heart'],
  ['laugh', 'Laughing'],
  ['party', 'Party'],
  ['fire', 'Fire'],
  ['thumbsup', 'Thumbs up'],
  ['clap', 'Clapping'],
  ['cat', 'Cat'],
  ['coffee', 'Coffee'],
  ['music', 'Music'],
  ['yes', 'Yes'],
  ['wow', 'Wow'],
];

export const GIFS = IDS.map(([id, title]) => ({
  id,
  title,
  src: `${BASE}gifs/${id}.gif`,
}));

const byId = new Map(GIFS.map((gif) => [gif.id, gif]));

export function getGif(id) {
  return byId.get(id) ?? { id, title: 'GIF', src: `${BASE}gifs/wow.gif`, unknown: true };
}
