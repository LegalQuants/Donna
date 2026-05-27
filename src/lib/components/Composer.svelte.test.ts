import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// modelStore.load() runs onMount and fetches; stub global fetch so it no-ops.
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
import Composer from './Composer.svelte';

describe('Composer matter picker', () => {
  it('shows the matter picker only when matters are provided', async () => {
    const { rerender } = render(Composer, { props: {} });
    expect(screen.queryByRole('button', { name: /choose matter/i })).not.toBeInTheDocument();
    await rerender({ matters: [{ id: 'a', name: 'Acme MSA' }] });
    expect(screen.getByRole('button', { name: /choose matter/i })).toBeInTheDocument();
  });
});
