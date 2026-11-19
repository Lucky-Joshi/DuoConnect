import { api, unwrap } from './api';
import { splitLinks } from './utils';

const MAX_CACHE_ENTRIES = 200;
const cache = new Map();

function remember(key, value) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/** Returns the first http(s) URL in a message, without trailing punctuation. */
export function firstLinkIn(text) {
  const found = splitLinks(text ?? '').find((part) => /^https?:\/\//i.test(part));
  return found ? found.replace(/[)\]}.,!?;:]+$/g, '') : null;
}

/** Fetches a preview once per URL; failures are cached as null for this session. */
export function getLinkPreview(url) {
  const key = String(url);
  if (cache.has(key)) return cache.get(key);

  const request = api
    .post('/links', { url: key }, { timeout: 12_000 })
    .then((response) => unwrap(response) ?? null)
    .catch(() => null)
    .then((preview) => {
      remember(key, preview);
      return preview;
    });

  remember(key, request);
  return request;
}

export function clearLinkPreviewCache() {
  cache.clear();
}
