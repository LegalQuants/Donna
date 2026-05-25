/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Message from './Message.svelte';

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
});
