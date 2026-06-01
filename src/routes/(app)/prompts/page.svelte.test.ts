/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

describe('/prompts index', () => {
  it('renders the Workflows sub-nav with Prompts active', () => {
    render(Page, { props: { data: { prompts: [] } } as never });
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(within(nav).getByRole('link', { name: 'Prompts' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders rows from data and opens the create modal', async () => {
    render(Page, { props: { data: { prompts: [{ id: 'p1', name: 'Risk review', prompt_text: 'x', tags: [] }] } } as never });
    expect(screen.getByText('Risk review')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /new prompt/i }));
    expect(screen.getByRole('dialog', { name: /new prompt/i })).toBeInTheDocument();
  });
  it('shows an empty state when there are no prompts', () => {
    render(Page, { props: { data: { prompts: [] } } as never });
    expect(screen.getByText(/no saved prompts/i)).toBeInTheDocument();
  });
  it('opening edit on a row seeds the modal with that prompt', async () => {
    render(Page, { props: { data: { prompts: [
      { id: 'p1', name: 'Alpha', prompt_text: 'a', tags: [] },
      { id: 'p2', name: 'Beta', prompt_text: 'b', tags: [] }
    ] } } as never });
    await fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[1]);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Beta');
    expect((screen.getByLabelText(/prompt text/i) as HTMLTextAreaElement).value).toBe('b');
  });
});
