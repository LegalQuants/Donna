<script lang="ts">
  import MarkdownIt from 'markdown-it';
  import { katex } from '@mdit/plugin-katex';
  import DOMPurify from 'isomorphic-dompurify';

  let { content = '' }: { content?: string } = $props();

  // html:true → pass raw HTML to DOMPurify which strips dangerous tags/attrs
  // entirely (script, event handlers, etc.). DOMPurify is the primary sanitizer;
  // it also provides defense-in-depth over plugin-emitted HTML (KaTeX).
  const md = new MarkdownIt({ html: true, linkify: true, breaks: true }).use(katex);

  const html = $derived(DOMPurify.sanitize(md.render(content ?? '')));
</script>

<div class="prose-mlq">{@html html}</div>
