import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBlockedAddress,
  normalizeHttpUrl,
  parseMetadata,
} from '../src/modules/links/links.service.js';

test('link previews accept only public standard web URLs', () => {
  const url = normalizeHttpUrl('https://www.example.com/story?utm=1#comments');
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'www.example.com');
  assert.equal(url.hash, '');

  for (const unsafe of [
    'javascript:alert(1)',
    'ftp://example.com/file',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://10.0.0.5',
    'http://169.254.169.254/latest/meta-data',
    'https://example.com:8443/page',
    'https://user:pass@example.com',
  ]) {
    assert.throws(() => normalizeHttpUrl(unsafe), undefined, unsafe);
  }
});

test('private IP detection covers IPv4 and IPv6 ranges', () => {
  for (const address of ['127.0.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1']) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  assert.equal(isBlockedAddress('8.8.8.8'), false);
});

test('metadata parsing prefers Open Graph fields and sanitizes image URLs', () => {
  const html = `
    <html><head>
      <title>Fallback &amp; title</title>
      <meta property="og:title" content="A great &quot;story&quot;" />
      <meta name="description" content="Short summary" />
      <meta property="og:site_name" content="Example" />
      <meta property="og:image" content="/cover.png" />
    </head></html>
  `;
  const preview = parseMetadata(html, 'https://www.example.com/story');

  assert.equal(preview.title, 'A great "story"');
  assert.equal(preview.description, 'Short summary');
  assert.equal(preview.siteName, 'Example');
  assert.equal(preview.image, 'https://www.example.com/cover.png');
  assert.equal(preview.url, 'https://www.example.com/story');

  const unsafeImage = parseMetadata(
    '<meta property="og:image" content="javascript:alert(1)" />',
    'https://example.com',
  );
  assert.equal(unsafeImage.image, null);
});
