/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const userSkill = { id: 's1', scope: 'user', slug: 'mine', display_name: 'My Skill', description: 'd', version: '1.0.0', tags: [], body: 'b', slash_alias: null, archived_at: null, created_at: '', updated_at: '' };
const builtin = { name: 'contract-review', title: 'Contract Review', version: '1', scope: 'builtin', description: 'Reviews contracts' };
const props = (over: Record<string, unknown> = {}) => ({ data: { skills: [userSkill], builtins: [builtin] }, ...over }) as never;

describe('/skills index', () => {
  it('renders the Your skills and Built-in skills sections', () => {
    render(Page, props());
    expect(screen.getByText('Your skills')).toBeInTheDocument();
    expect(screen.getByText('Built-in skills')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Skill/ })).toHaveAttribute('href', '/skills/s1');
    expect(screen.getByText('Contract Review')).toBeInTheDocument();
  });

  it('shows the empty state for your skills when none', () => {
    render(Page, props({ data: { skills: [], builtins: [builtin] } }));
    expect(screen.getByText(/No skills yet/)).toBeInTheDocument();
  });

  it('filters built-ins by the search query', async () => {
    const b2 = { name: 'nda-check', title: 'NDA Check', version: '1', scope: 'builtin' };
    render(Page, props({ data: { skills: [], builtins: [builtin, b2] } }));
    await fireEvent.input(screen.getByLabelText('Search built-in skills'), { target: { value: 'nda' } });
    expect(screen.queryByText('Contract Review')).not.toBeInTheDocument();
    expect(screen.getByText('NDA Check')).toBeInTheDocument();
  });

  it('opens the fork confirm modal with a derived slug when a built-in Fork is clicked', async () => {
    render(Page, props({ data: { skills: [], builtins: [builtin] } }));
    await fireEvent.click(screen.getByRole('button', { name: 'Fork Contract Review' }));
    expect(screen.getByRole('dialog', { name: 'Fork skill' })).toBeInTheDocument();
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('contract-review');
  });
});
