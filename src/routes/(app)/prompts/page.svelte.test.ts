/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

describe('/prompts index', () => {
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
});
