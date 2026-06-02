/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Message from './Message.svelte';

const h = vi.hoisted(() => ({ provenance: 'always' as 'always' | 'collapsed' }));
vi.mock('$app/state', () => ({ page: { get data() { return { user: { provenance_pills: h.provenance } }; } } }));

describe('Message', () => {
  it('renders a user turn as a plain chip (no markdown block)', () => {
    const { container, getByText } = render(Message, { props: { message: { key: 'u1', id: 'u1', role: 'user', content: 'hello there' } } });
    expect(getByText('hello there')).toBeInTheDocument();
    expect(container.querySelector('.prose-mlq')).toBeNull();
  });

  it('renders an assistant turn as markdown prose with the tier chip', () => {
    const { container, getByText } = render(Message, {
      props: { message: { key: 'a1', id: 'a1', role: 'assistant', content: '**done**', routed_inference_tier: 3, status: 'done' } }
    });
    expect(container.querySelector('.prose-mlq')).not.toBeNull();
    expect(getByText(/Tier 3/)).toBeInTheDocument();
  });

  it('shows an error with a Retry button that calls onretry', async () => {
    let retried = false;
    const { getByRole } = render(Message, {
      props: { message: { key: 'a1', id: 'a1', role: 'assistant', content: '', status: 'error', error: 'gateway timeout' }, onretry: () => (retried = true) }
    });
    getByRole('button', { name: /retry/i }).click();
    expect(retried).toBe(true);
  });

  it('renders citation pills for a done assistant message with citations', () => {
    const { container } = render(Message, {
      props: { message: {
        key: 'a2', id: 'a2', role: 'assistant', status: 'done',
        content: 'Terminate on "thirty days" (Source: [1]).',
        citations: [{ id: 'c1', source_file_id: 'f1', source_text: 'thirty days', partial: false, verified: true, verification_method: 'exact_match' }]
      } }
    });
    expect(container.querySelector('.cite-tab.cite-verified')).not.toBeNull();
  });

  it('shows the Anonymized badge when message.anonymized is true', () => {
    const { getByText } = render(Message, {
      props: { message: { key: 'a3', id: 'a3', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, anonymized: true } }
    });
    expect(getByText(/Anonymized/i)).toBeInTheDocument();
  });
  it('does not show the badge when anonymized is false/undefined', () => {
    const { queryByText } = render(Message, {
      props: { message: { key: 'a4', id: 'a4', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, anonymized: false } }
    });
    expect(queryByText(/Anonymized/i)).toBeNull();
  });

  it('shows the applied-skills footer with prettified, linked names', () => {
    const { getByText, getByRole } = render(Message, {
      props: { message: { key: 'a7', id: 'a7', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, applied_skills: ['comms-improver', 'nda-review'] } }
    });
    expect(getByText(/Applied:/)).toBeInTheDocument();
    const link = getByRole('link', { name: 'Comms Improver' });
    expect(link).toHaveAttribute('href', '/skills');
    expect(getByRole('link', { name: 'NDA Review' })).toHaveAttribute('href', '/skills');
  });

  it('renders no applied-skills footer when none were applied', () => {
    const { queryByText } = render(Message, {
      props: { message: { key: 'a8', id: 'a8', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4 } }
    });
    expect(queryByText(/Applied:/)).toBeNull();
  });

  it('shows a file-count indicator (plural) when applied_file_ids are present', () => {
    const { getByText } = render(Message, {
      props: { message: { key: 'af1', id: 'af1', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, applied_file_ids: ['x', 'y'] } }
    });
    expect(getByText('2 files')).toBeInTheDocument();
  });

  it('uses the singular for one attached file', () => {
    const { getByText } = render(Message, {
      props: { message: { key: 'af2', id: 'af2', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4, applied_file_ids: ['x'] } }
    });
    expect(getByText('1 file')).toBeInTheDocument();
  });

  it('renders no file indicator when none were applied', () => {
    const { queryByText } = render(Message, {
      props: { message: { key: 'af3', id: 'af3', role: 'assistant', status: 'done', content: 'ok', routed_inference_tier: 4 } }
    });
    expect(queryByText(/\bfiles?\b/)).toBeNull();
  });
});

const doneMsg = {
  key: 'a9', id: 'a9', role: 'assistant', content: 'Answer.', status: 'done',
  routed_inference_tier: 4, anonymized: true, applied_skills: ['summarize'], citations: []
} as unknown as import('$lib/chat/chatStream.svelte').ChatMessage;

describe('Message provenance pills (provenance_pills preference)', () => {
  it('shows Tier + Anonymized + Applied and no Details toggle when always', () => {
    h.provenance = 'always';
    render(Message, { props: { message: doneMsg } });
    expect(screen.getByText(/Tier 4/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymized/)).toBeInTheDocument();
    expect(screen.getByText(/Applied:/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull();
  });

  it('hides the pills behind a Details toggle when collapsed, revealing them on click', async () => {
    h.provenance = 'collapsed';
    render(Message, { props: { message: doneMsg } });
    expect(screen.queryByText(/Tier 4/)).toBeNull();
    expect(screen.queryByText(/Anonymized/)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /details/i }));
    expect(screen.getByText(/Tier 4/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymized/)).toBeInTheDocument();
    expect(screen.getByText(/Applied:/)).toBeInTheDocument();
  });
});
