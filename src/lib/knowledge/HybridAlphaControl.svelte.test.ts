/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HybridAlphaControl from './HybridAlphaControl.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const kb = (over = {}) => ({
  id: 'k1', name: 'KB', description: null, owner_id: 'u', hybrid_alpha: 0.5,
  file_count: 0, chunk_count: 0, created_at: '', updated_at: '', ...over
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('HybridAlphaControl', () => {
  it('renders a range slider initialized to kb.hybrid_alpha', () => {
    render(HybridAlphaControl, { props: { kb: kb({ hybrid_alpha: 0.7 }) } });
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('0.7');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1');
  });

  it('renders Vector and FTS endpoint labels', () => {
    render(HybridAlphaControl, { props: { kb: kb() } });
    expect(screen.getByText('Vector')).toBeInTheDocument();
    expect(screen.getByText('FTS')).toBeInTheDocument();
  });

  it('fires exactly one form submit after 400 ms of slider settle (debounce)', async () => {
    const { container } = render(HybridAlphaControl, { props: { kb: kb() } });
    const submitSpy = vi.fn((e: Event) => e.preventDefault());
    container.addEventListener('submit', submitSpy, true);
    const slider = screen.getByRole('slider') as HTMLInputElement;

    await fireEvent.input(slider, { target: { value: '0.6' } });
    await fireEvent.input(slider, { target: { value: '0.7' } });
    await fireEvent.input(slider, { target: { value: '0.8' } });
    expect(submitSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const form = submitSpy.mock.calls[0][0].target as HTMLFormElement;
    expect(form.action).toContain('?/setHybridAlpha');
    expect((form.querySelector('input[name="hybrid_alpha"]') as HTMLInputElement).value).toBe('0.8');
  });
});
