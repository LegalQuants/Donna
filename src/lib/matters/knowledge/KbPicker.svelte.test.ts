/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import KbPicker from './KbPicker.svelte';
import type { KnowledgeBase } from '$lib/knowledge/types';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over: Partial<KnowledgeBase>): KnowledgeBase => ({
  id: 'k1', name: 'Standards', owner_id: 'u', hybrid_alpha: 0.5,
  file_count: 3, chunk_count: 50,
  created_at: '2026-05-28T00:00:00Z', updated_at: '2026-05-28T00:00:00Z',
  ...over
});

describe('KbPicker', () => {
  it('renders a Link button by default; popover is hidden', () => {
    render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' })], onpick: vi.fn() } });
    expect(screen.getByRole('button', { name: /link a knowledge base/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
  });

  it('opens the popover on click and shows all KBs', async () => {
    render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' }), kb({ id: 'b', name: 'Beta' })], onpick: vi.fn() } });
    await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
    expect(screen.getByPlaceholderText(/search knowledge bases/i)).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('filters by case-insensitive substring on the name', async () => {
    render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' }), kb({ id: 'b', name: 'Beta' })], onpick: vi.fn() } });
    await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
    await fireEvent.input(screen.getByPlaceholderText(/search knowledge bases/i), { target: { value: 'bet' } });
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('calls onpick with the kb id when a result is clicked, then closes', async () => {
    const onpick = vi.fn();
    render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' })], onpick } });
    await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
    await userEvent.click(screen.getByText('Alpha'));
    expect(onpick).toHaveBeenCalledWith('a');
    expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
  });

  it('shows a no-KBs message (without deferred-create disclaimer) when there are no KBs available', async () => {
    render(KbPicker, { props: { kbs: [], onpick: vi.fn() } });
    await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
    expect(screen.getByText(/no other knowledge bases to link/i)).toBeInTheDocument();
    expect(screen.queryByText(/creating a kb lands in a follow-up slice/i)).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(KbPicker, { props: { kbs: [kb({ id: 'a', name: 'Alpha' })], onpick: vi.fn() } });
    await userEvent.click(screen.getByRole('button', { name: /link a knowledge base/i }));
    expect(screen.getByPlaceholderText(/search knowledge bases/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText(/search knowledge bases/i)).not.toBeInTheDocument();
  });
});

describe('KbPicker — create affordance (P4-3b)', () => {
  it('renders a "+ Create new KB" affordance when opened', async () => {
    render(KbPicker, { props: { kbs: [kb({ id: 'k1', name: 'Existing' })], onpick: () => {} } });
    await fireEvent.click(screen.getByRole('button', { name: 'Link a knowledge base' }));
    expect(screen.getByRole('button', { name: 'Create new KB' })).toBeInTheDocument();
  });

  it('renders the affordance in the empty-KB state too', async () => {
    render(KbPicker, { props: { kbs: [], onpick: () => {} } });
    await fireEvent.click(screen.getByRole('button', { name: 'Link a knowledge base' }));
    expect(screen.getByRole('button', { name: 'Create new KB' })).toBeInTheDocument();
    // The deferred-create copy is gone.
    expect(screen.queryByText(/lands in a follow-up slice/i)).not.toBeInTheDocument();
  });

  it('clicking "+ Create new KB" swaps the search list for the create form', async () => {
    render(KbPicker, { props: { kbs: [kb({ id: 'k1' })], onpick: () => {} } });
    await fireEvent.click(screen.getByRole('button', { name: 'Link a knowledge base' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Create new KB' }));
    expect(screen.getByRole('form', { name: 'Create knowledge base' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search knowledge bases…')).not.toBeInTheDocument();
  });
});
