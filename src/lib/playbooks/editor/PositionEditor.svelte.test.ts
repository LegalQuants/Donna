/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Wrapper from './PositionEditor.test.svelte';
import { blankPosition } from '../editorDraft';
import type { PositionCreate } from '../types';

function setup() {
  const seen: PositionCreate[] = [];
  render(Wrapper, { props: { initial: blankPosition(0), onseen: (p: PositionCreate) => seen.push(p) } });
  return seen;
}

describe('PositionEditor', () => {
  it('editing the issue emits the updated position', async () => {
    const seen = setup();
    await fireEvent.input(screen.getByLabelText(/^issue/i), { target: { value: 'Confidentiality' } });
    expect(seen.at(-1)!.issue).toBe('Confidentiality');
  });

  it('keywords textarea (one per line) becomes a string array', async () => {
    const seen = setup();
    await fireEvent.input(screen.getByLabelText(/detection keywords/i), { target: { value: 'confidential\n\nproprietary' } });
    expect(seen.at(-1)!.detection_keywords).toEqual(['confidential', 'proprietary']);
  });

  it('changing severity emits it', async () => {
    const seen = setup();
    await fireEvent.change(screen.getByLabelText(/severity/i), { target: { value: 'critical' } });
    expect(seen.at(-1)!.severity_if_missing).toBe('critical');
  });

  it('preserves pre-seeded keywords on mount', () => {
    const seen: PositionCreate[] = [];
    const initial = { ...blankPosition(0), detection_keywords: ['alpha', 'beta'] };
    render(Wrapper, { props: { initial, onseen: (p: PositionCreate) => seen.push(p) } });
    expect(seen.at(-1)!.detection_keywords).toEqual(['alpha', 'beta']);
  });
});
