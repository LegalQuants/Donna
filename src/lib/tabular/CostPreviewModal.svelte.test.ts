import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CostPreviewModal from './CostPreviewModal.svelte';

const preview = { cells_count: 6, estimated_tokens: 1200, estimated_cost_usd: '0.12', per_tier_breakdown: { default: 6 } };

describe('CostPreviewModal', () => {
  it('shows the cell count and estimated cost', () => {
    render(CostPreviewModal, { props: { preview, busy: false, onconfirm: vi.fn(), oncancel: vi.fn() } as never });
    expect(screen.getByText(/6 cells/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
  });

  it('fires onconfirm and oncancel', async () => {
    const onconfirm = vi.fn();
    const oncancel = vi.fn();
    render(CostPreviewModal, { props: { preview, busy: false, onconfirm, oncancel } as never });
    await fireEvent.click(screen.getByRole('button', { name: /run review/i }));
    expect(onconfirm).toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(oncancel).toHaveBeenCalled();
  });

  it('disables the confirm button while busy', () => {
    render(CostPreviewModal, { props: { preview, busy: true, onconfirm: vi.fn(), oncancel: vi.fn() } as never });
    expect(screen.getByRole('button', { name: /run review/i })).toBeDisabled();
  });

  it('shows the ensemble premium line when ensemble cells are present', () => {
    const previewWithEnsemble = { cells_count: 4, estimated_cost_usd: '0.10', per_tier_breakdown: {}, ensemble_cells_count: 2, ensemble_premium_usd: '0.04' };
    render(CostPreviewModal, { props: { preview: previewWithEnsemble, busy: false, onconfirm: vi.fn(), oncancel: vi.fn() } as never });
    const el = screen.getByTestId('ensemble-premium');
    expect(el.textContent).toMatch(/2 ensemble-verified cell/i);
    expect(el.textContent).toMatch(/\+\$0\.04 ensemble premium/i);
  });

  it('omits the premium line when there are no ensemble cells', () => {
    const previewNoEnsemble = { cells_count: 4, estimated_cost_usd: '0.10', per_tier_breakdown: {} };
    render(CostPreviewModal, { props: { preview: previewNoEnsemble, busy: false, onconfirm: vi.fn(), oncancel: vi.fn() } as never });
    expect(screen.queryByTestId('ensemble-premium')).not.toBeInTheDocument();
  });
});
