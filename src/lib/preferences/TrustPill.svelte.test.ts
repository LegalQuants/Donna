/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TrustPill from './TrustPill.svelte';
import type { ChatModelOption } from '$lib/models/types';

const local: ChatModelOption = { id: 'local-fast', label: 'Llama 3', resolvedModel: 'ollama/llama3', group: 'local', tier: 1 };
const cloud: ChatModelOption = { id: 'smart', label: 'Opus 4.7', resolvedModel: 'anthropic-prod/claude-opus-4-7', group: 'cloud', tier: 4 };

describe('TrustPill', () => {
  it('renders nothing when option is null', () => {
    const { container } = render(TrustPill, { props: { option: null, format: 'labels' } });
    expect(container.querySelector('[data-testid="trust-pill"]')).toBeNull();
  });

  it('labels: shows the full text for a local model', () => {
    render(TrustPill, { props: { option: local, format: 'labels' } });
    expect(screen.getByTestId('trust-pill')).toHaveTextContent('Self-hosted · Local');
  });

  it('labels: shows the cloud text with tier', () => {
    render(TrustPill, { props: { option: cloud, format: 'labels' } });
    expect(screen.getByTestId('trust-pill')).toHaveTextContent('Cloud · Tier 4');
  });

  it('dots: shows no visible label text but keeps it in the title', () => {
    render(TrustPill, { props: { option: local, format: 'dots' } });
    const pill = screen.getByTestId('trust-pill');
    expect(pill).not.toHaveTextContent('Self-hosted');
    expect(pill).toHaveAttribute('title', expect.stringContaining('Self-hosted · Local'));
  });
});
