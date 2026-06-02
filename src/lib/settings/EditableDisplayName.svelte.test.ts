/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
import EditableDisplayName from './EditableDisplayName.svelte';

const input = () => screen.getByRole('textbox', { name: /display name/i }) as HTMLInputElement;

describe('EditableDisplayName', () => {
  it('read mode: shows the rebranded name and an Edit button, no input', () => {
    render(EditableDisplayName, { props: { name: 'Jane Counsel' } });
    expect(screen.getByText('Jane Counsel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /display name/i })).toBeNull();
  });

  it('rebrands the displayed name (LQ.AI → Donna)', () => {
    render(EditableDisplayName, { props: { name: 'LQ.AI Admin' } });
    expect(screen.getByText('Donna Admin')).toBeInTheDocument();
  });

  it('Edit reveals an input pre-filled with the rebranded value plus Save and Cancel', async () => {
    render(EditableDisplayName, { props: { name: 'LQ.AI Admin' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(input().value).toBe('Donna Admin');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Save is ENABLED for the rebranded-admin case (rebranded pre-fill differs from raw stored)', async () => {
    render(EditableDisplayName, { props: { name: 'LQ.AI Admin' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Save is DISABLED for a no-op (input equals raw stored) and when cleared', async () => {
    render(EditableDisplayName, { props: { name: 'Jane Counsel' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // Pre-fill equals raw stored (no LQ.AI token) → no-op → disabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Whitespace only → empty after trim → disabled.
    await fireEvent.input(input(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Real change → enabled.
    await fireEvent.input(input(), { target: { value: 'Jane New' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Cancel returns to read mode', async () => {
    render(EditableDisplayName, { props: { name: 'Jane Counsel' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: /display name/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
