import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MatterBadge from './MatterBadge.svelte';

describe('MatterBadge', () => {
  it('links to the matter detail page', () => {
    render(MatterBadge, { props: { matter: { id: 'p1', name: 'Acme MSA' } } });
    const link = screen.getByRole('link', { name: /Acme MSA/ });
    expect(link).toHaveAttribute('href', '/matters/p1');
  });

  it('shows a muted "No matter" when null', () => {
    render(MatterBadge, { props: { matter: null } });
    expect(screen.getByText('No matter')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
