import { Fragment } from 'react';

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*)/g;
const LINK_TOKEN = /(https?:\/\/[^\s<>]+)/gi;

function linkify(text, keyPrefix) {
  return String(text)
    .split(LINK_TOKEN)
    .map((part, index) => {
      const key = `${keyPrefix}-link-${index}`;
      return /^https?:\/\//i.test(part) ? (
        <a key={key} href={part} target="_blank" rel="noreferrer noopener">
          {part}
        </a>
      ) : (
        <Fragment key={key}>{part}</Fragment>
      );
    });
}

function renderInline(text, keyPrefix) {
  return String(text)
    .split(INLINE_TOKEN)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (/^\*\*[^*\n]+\*\*$/.test(part) || /^__[^_\n]+__$/.test(part)) {
        return <strong key={key}>{linkify(part.slice(2, -2), key)}</strong>;
      }
      if (/^~~[^~\n]+~~$/.test(part)) {
        return <s key={key}>{linkify(part.slice(2, -2), key)}</s>;
      }
      if (/^`[^`\n]+`$/.test(part)) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      if (/^\*[^*\n]+\*$/.test(part)) {
        return <em key={key}>{linkify(part.slice(1, -1), key)}</em>;
      }
      return <Fragment key={key}>{linkify(part, key)}</Fragment>;
    });
}

/** Minimal safe markdown: no raw HTML, no dangerouslySetInnerHTML. */
export function RichText({ text = '' }) {
  return String(text)
    .split('```')
    .map((part, index) => {
      if (index % 2 === 1) {
        return (
          <pre key={`code-${index}`}>
            <code>{part.replace(/^\n+|\n+$/g, '')}</code>
          </pre>
        );
      }
      return <Fragment key={`text-${index}`}>{renderInline(part, `text-${index}`)}</Fragment>;
    });
}
