/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Markdown from './Markdown.svelte';

describe('Markdown', () => {
  it('renders GFM markdown (bold, list)', () => {
    const { container } = render(Markdown, { props: { content: '**bold** and\n\n- item one\n- item two' } });
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('sanitizes embedded HTML — no script survives', () => {
    const { container } = render(Markdown, { props: { content: 'hi <script>alert(1)</script> there' } });
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('alert(1)');
  });
});
