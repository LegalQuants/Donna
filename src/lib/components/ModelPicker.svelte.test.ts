/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ModelPicker from './ModelPicker.svelte';
import type { ChatModelOption } from '$lib/models/types';

const OPTIONS: ChatModelOption[] = [
  { id: 'smart', label: 'Opus 4.7', resolvedModel: 'anthropic-prod/claude-opus-4-7', group: 'cloud', tier: 4 },
  { id: 'fast', label: 'Sonnet 4.6', resolvedModel: 'anthropic-prod/claude-sonnet-4-6', group: 'cloud', tier: 4 },
  { id: 'local', label: 'qwen3.5:9b', resolvedModel: 'ollama-local/qwen3.5:9b', group: 'local', tier: 1 }
];

describe('ModelPicker', () => {
  it('shows the selected alias and resolved model on the trigger', () => {
    const { getByTestId } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect: vi.fn() } });
    expect(getByTestId('model-picker')).toHaveTextContent('smart');
    expect(getByTestId('model-picker')).toHaveTextContent('Opus 4.7');
  });

  it('opens on click and calls onselect with the chosen id', async () => {
    const onselect = vi.fn();
    const { getByTestId } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: false, onselect } });
    await userEvent.click(getByTestId('model-picker'));
    await userEvent.click(getByTestId('model-option-fast'));
    expect(onselect).toHaveBeenCalledWith('fast');
  });

  it('shows an unavailable note when error is set', async () => {
    const { getByTestId, getByText } = render(ModelPicker, { props: { options: OPTIONS, selected: 'smart', error: true, onselect: vi.fn() } });
    await userEvent.click(getByTestId('model-picker'));
    expect(getByText(/unavailable/i)).toBeInTheDocument();
  });
});
