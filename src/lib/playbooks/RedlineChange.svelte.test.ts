/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RedlineChange from './RedlineChange.svelte';

describe('RedlineChange', () => {
  it('renders the old text struck-through and the new text', () => {
    render(RedlineChange, { props: { redline: { old_text: 'ninety (90) days', new_text: 'thirty (30) days', justification: 'j' } } });
    const oldEl = screen.getByText('ninety (90) days');
    expect(oldEl.className).toMatch(/line-through/);
    expect(screen.getByText('thirty (30) days')).toBeInTheDocument();
  });

  it('renders only the insertion when old_text is empty (pure insertion)', () => {
    const { container } = render(RedlineChange, { props: { redline: { old_text: '', new_text: 'Added confidentiality clause.', justification: 'j' } } });
    expect(screen.getByText('Added confidentiality clause.')).toBeInTheDocument();
    expect(container.querySelector('.line-through')).toBeNull();
  });

  it('does not render the justification (that belongs to the caller)', () => {
    render(RedlineChange, { props: { redline: { old_text: 'a', new_text: 'b', justification: 'SHOULD NOT APPEAR' } } });
    expect(screen.queryByText('SHOULD NOT APPEAR')).not.toBeInTheDocument();
  });
});
