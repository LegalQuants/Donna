// src/routes/(app)/automations/watches/page.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
import Page from './+page.svelte';

const libs = { playbookItems: [], skillItems: [], kbs: [], matters: [] };

describe('/automations/watches page', () => {
  it('shows the opt-in gate when autonomous is off', () => {
    render(Page, { props: { data: { autonomousEnabled: false, unread: 0, watches: [], ...libs }, form: null } as never });
    expect(screen.getByText(/Automations are off/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new watch/i })).toBeNull();
  });

  it('shows the New watch control and the list when opted in', () => {
    const watch = { id: 'w1', knowledge_base_id: 'kb1', playbook_id: 'p1', skill_ref: null, project_id: null, max_cost_usd: null, enabled: true };
    render(Page, { props: { data: { autonomousEnabled: true, unread: 0, watches: [watch], playbookItems: [{ value: 'p1', label: 'NDA' }], skillItems: [], kbs: [{ id: 'kb1', name: 'Contracts KB', owner_id: 'u1', hybrid_alpha: 0.5, file_count: 0, chunk_count: 0, created_at: 'x', updated_at: 'x' }], matters: [] }, form: null } as never });
    expect(screen.getByRole('button', { name: /new watch/i })).toBeInTheDocument();
    expect(screen.getByText('Contracts KB')).toBeInTheDocument();
  });

  it('shows a failed toggle/delete error at page level even with the form closed', () => {
    render(Page, { props: { data: { autonomousEnabled: true, unread: 0, watches: [], ...libs }, form: { error: 'Could not update the watch.' } } as never });
    expect(screen.queryByRole('button', { name: /save watch/i })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not update the watch/i);
  });

  it('reveals the inline create form when "New watch" is clicked', async () => {
    render(Page, { props: { data: { autonomousEnabled: true, unread: 0, watches: [], playbookItems: [{ value: 'p1', label: 'NDA' }], skillItems: [], kbs: [], matters: [] }, form: null } as never });
    expect(screen.queryByRole('button', { name: /save watch/i })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /new watch/i }));
    expect(screen.getByRole('button', { name: /save watch/i })).toBeInTheDocument();
  });
});
