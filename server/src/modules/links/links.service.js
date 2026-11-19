import dns from 'node:dns/promises';
import net from 'node:net';
import { badRequest } from '../../utils/errors.js';

const MAX_URL_LENGTH = 2048;
const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 4;
const USER_AGENT = 'DuoConnectLinkPreview/1.0';

// Separate lists avoid a Node 24 Windows quirk where mixed-family subnets
// affect checks against the other family.
const BLOCKED_IPV4 = new net.BlockList();
const BLOCKED_IPV6 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32],
]) {
  BLOCKED_IPV4.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  BLOCKED_IPV6.addSubnet(address, prefix, 'ipv6');
}

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.test',
  '.example',
  '.invalid',
  '.home.arpa',
];

const ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : '';
      }
      return ENTITIES[entity.toLowerCase()] ?? '';
    })
    .trim();
}

function tagAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

/** Rejects private, loopback, link-local, and non-web URLs before any fetch. */
export function normalizeHttpUrl(value) {
  if (typeof value !== 'string') throw badRequest('Enter a valid link.');
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) throw badRequest('Enter a valid link.');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Enter a valid link.');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw badRequest('Only web links are supported.');
  if (url.username || url.password) throw badRequest('Links with credentials are not supported.');
  if (url.port && !['80', '443'].includes(url.port)) {
    throw badRequest('Only standard web ports are supported.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname.length > 253) throw badRequest('Enter a valid link.');
  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw badRequest('That link cannot be previewed.');
  }
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw badRequest('That link cannot be previewed.');
  }

  url.hash = '';
  return url;
}

export function isBlockedAddress(address) {
  const ip = String(address ?? '').replace(/^\[|\]$/g, '');
  const family = net.isIP(ip);
  if (!family) return true;
  return family === 6 ? BLOCKED_IPV6.check(ip, 'ipv6') : BLOCKED_IPV4.check(ip, 'ipv4');
}

async function assertPublicHost(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw badRequest('That link cannot be previewed.');
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw badRequest('That link cannot be previewed.');
  }
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function readHtml(response) {
  if (!response.body) return null;
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_HTML_BYTES) return null;

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchHtml(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(current);

    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9',
        'user-agent': USER_AGENT,
      },
    });

    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) return null;
      current = normalizeHttpUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel();
      return null;
    }
    const html = await readHtml(response);
    return html ? { html, finalUrl: current.toString() } : null;
  }
  return null;
}

function assetUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const resolved = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function clamp(value, max) {
  return value && value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Parses Open Graph/Twitter/standard metadata from an HTML document. */
export function parseMetadata(html, baseUrl) {
  const metadata = new Map();
  for (const match of String(html ?? '').matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (tagAttribute(tag, 'property') || tagAttribute(tag, 'name')).toLowerCase();
    const content = tagAttribute(tag, 'content');
    if (key && content && !metadata.has(key)) metadata.set(key, content);
  }

  const titleTag = String(html ?? '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const base = new URL(baseUrl);
  const hostname = base.hostname.replace(/^www\./, '');
  const title =
    metadata.get('og:title') ||
    metadata.get('twitter:title') ||
    decodeEntities(titleTag?.[1]?.replace(/<[^>]*>/g, '')) ||
    metadata.get('og:site_name') ||
    hostname;
  const description =
    metadata.get('og:description') ||
    metadata.get('twitter:description') ||
    metadata.get('description') ||
    '';

  return {
    url: base.toString(),
    siteName: clamp(metadata.get('og:site_name') || hostname, 80),
    title: clamp(title, 120) || hostname,
    description: clamp(description, 180),
    image: assetUrl(
      metadata.get('og:image') ||
        metadata.get('og:image:url') ||
        metadata.get('twitter:image') ||
        metadata.get('twitter:image:src'),
      base,
    ),
  };
}

/** Fetches metadata for one public web page. Failures return null (no card). */
export async function fetchLinkPreview(rawUrl) {
  const url = normalizeHttpUrl(rawUrl);
  const result = await fetchHtml(url);
  return result ? parseMetadata(result.html, result.finalUrl) : null;
}
