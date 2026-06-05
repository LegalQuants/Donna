// src/lib/automations/SourcePicker.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import SourcePicker from './SourcePicker.svelte';
import type { SourceItem } from './runNow';

const items: SourceItem[] = [
  { value: 'p1', label: 'NDA — Mutual', sub: 'NDA' },
  { value: 'p2', label: 'DPA — GDPR', sub: 'DPA' }
];

describe('SourcePicker', () => {
  it('lists items and emits the value on select', async () => {
    const onselect = vi.fn();
    render(SourcePicker, { props: { items, selectedValue: null, label: 'Choose a playbook', onselect } });
    await fireEvent.click(screen.getByRole('button', { name: /DPA — GDPR/ }));
    expect(onselect).toHaveBeenCalledWith('p2');
  });
  it('filters by the search query', async () => {
    render(SourcePicker, { props: { items, selectedValue: null, label: 'Choose', onselect: () => {} } });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'gdpr' } });
    expect(screen.queryByText('NDA — Mutual')).not.toBeInTheDocument();
    expect(screen.getByText('DPA — GDPR')).toBeInTheDocument();
  });
  it('shows a no-matches row when the search filters everything out', async () => {
    render(SourcePicker, { props: { items, selectedValue: null, label: 'Choose', onselect: () => {} } });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'zzz-nothing' } });
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });
  it('shows an empty note when there are no items', () => {
    render(SourcePicker, { props: { items: [], selectedValue: null, label: 'Choose', emptyNote: 'No playbooks yet.', onselect: () => {} } });
    expect(screen.getByText('No playbooks yet.')).toBeInTheDocument();
  });
});
