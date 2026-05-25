/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ReceiptEventRow from './ReceiptEventRow.svelte';
import type { ReceiptEvent } from '$lib/receipts/types';

const inf: ReceiptEvent = { ts: '2026-05-25T05:04:39Z', kind: 'inference', detail: { provider: 'anthropic-prod', model: 'claude-opus-4-7', tier: 4, tokens_in: 379, tokens_out: 428, latency_ms: 7589, refused: false, anonymization_applied: true, message_id: 'm1' } };

describe('ReceiptEventRow', () => {
  it('renders label, detail, tier badge, and anonymization status', () => {
    const { getByText } = render(ReceiptEventRow, { props: { event: inf } });
    expect(getByText('claude-opus-4-7')).toBeInTheDocument();
    expect(getByText(/anthropic-prod/)).toBeInTheDocument();
    expect(getByText(/Tier 4/)).toBeInTheDocument();
    expect(getByText(/Anonymized/i)).toBeInTheDocument();
  });
  it('toggles the raw-detail expander', async () => {
    const { getByRole, queryByText, getByText } = render(ReceiptEventRow, { props: { event: inf } });
    expect(queryByText(/"message_id": "m1"/)).toBeNull();
    await fireEvent.click(getByRole('button', { name: /details/i }));
    expect(getByText(/"message_id": "m1"/)).toBeInTheDocument();
  });
});
