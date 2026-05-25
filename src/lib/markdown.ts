import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';
import DOMPurify from 'isomorphic-dompurify';

// html:true → raw HTML passes to DOMPurify which strips dangerous tags/attrs.
// DOMPurify is the authoritative sanitizer (also covers KaTeX-emitted HTML).
const md = new MarkdownIt({ html: true, linkify: true, breaks: true }).use(katex);

/** Render markdown to sanitized HTML. */
export function renderMarkdown(content: string = ''): string {
  return DOMPurify.sanitize(md.render(content ?? ''));
}
