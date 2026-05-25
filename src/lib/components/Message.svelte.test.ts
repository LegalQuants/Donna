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
});
