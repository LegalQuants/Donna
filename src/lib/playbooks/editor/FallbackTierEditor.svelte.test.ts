/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import type { FallbackTier } from '../types';

// Wrapper drives the bindable `tiers` and exposes the latest value for assertions.
import Wrapper from './FallbackTierEditor.test.svelte';

describe('FallbackTierEditor', () => {
  it('adds a tier with the next rank', async () => {
    const seen: FallbackTier[][] = [];
    render(Wrapper, { props: { initial: [], onseen: (t: FallbackTier[]) => seen.push(t) } });
    await fireEvent.click(screen.getByRole('button', { name: /add fallback tier/i }));
    expect(seen.at(-1)).toEqual([{ rank: 1, description: '', language: '' }]);
  });

  it('removing the first of two tiers renumbers ranks to 1', async () => {
    const seen: FallbackTier[][] = [];
    render(Wrapper, {
      props: {
        initial: [{ rank: 1, description: 'a', language: 'LA' }, { rank: 2, description: 'b', language: 'LB' }],
        onseen: (t: FallbackTier[]) => seen.push(t)
      }
    });
    await fireEvent.click(screen.getAllByRole('button', { name: /remove tier/i })[0]);
    expect(seen.at(-1)).toEqual([{ rank: 1, description: 'b', language: 'LB' }]);
  });
});
