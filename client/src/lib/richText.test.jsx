import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText } from './richText';

function render(text) {
  return renderToStaticMarkup(<RichText text={text} />);
}

describe('RichText', () => {
  it('renders supported markdown as semantic elements', () => {
    const html = render('**bold** and *italic* and ~~gone~~ and `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<s>gone</s>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders fenced code blocks without interpreting markup inside them', () => {
    const html = render('```\n**not bold**\n```');
    expect(html).toContain('<pre><code>**not bold**</code></pre>');
    expect(html).not.toContain('<strong>');
  });

  it('linkifies URLs and never emits raw HTML', () => {
    const html = render('<img src=x onerror=alert(1)> https://example.com/story');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="https://example.com/story"');
  });
});
