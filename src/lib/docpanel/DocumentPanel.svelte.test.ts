import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DocumentPanel from './DocumentPanel.svelte';
import type { DocPanel } from './docPanel.svelte';

// A hand-rolled stub controller (plain object) matching the DocPanel surface the panel uses.
function stub(over: Partial<DocPanel> = {}): DocPanel {
  return {
    open_: true,
    tabs: [{ fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x' }],
    activeId: 'f1',
    activeTab: { fileId: 'f1', filename: 'spike.pdf', mime: 'application/pdf', status: 'ready', page: 1, quote: 'x' },
    width: 480,
    open: vi.fn(),
    setActive: vi.fn(),
    close: vi.fn(),
    closePanel: vi.fn(),
    setWidth: vi.fn(),
    ...over
  } as unknown as DocPanel;
}

describe('DocumentPanel', () => {
  it('renders the active tab filename', () => {
    render(DocumentPanel, { props: { docPanel: stub() } });
    expect(screen.getByText('spike.pdf')).toBeInTheDocument();
  });

  it('calls closePanel when the close button is clicked', async () => {
    const dp = stub();
    render(DocumentPanel, { props: { docPanel: dp } });
    await userEvent.click(screen.getByRole('button', { name: /close document panel/i }));
    expect(dp.closePanel).toHaveBeenCalledOnce();
  });
});
