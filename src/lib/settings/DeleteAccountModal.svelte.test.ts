/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DeleteAccountModal from './DeleteAccountModal.svelte';

type Result = { type: string; data?: Record<string, unknown> };
type PostCb = (args: { result: Result }) => Promise<void>;
type SubmitFn = () => PostCb;

const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
	enhance: (_node: HTMLFormElement, submit: SubmitFn) => {
		hoisted.submit = submit;
		return {};
	}
}));

describe('DeleteAccountModal', () => {
	it('renders nothing when closed', () => {
		render(DeleteAccountModal, { props: { open: false } });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('keeps the confirm button disabled until DELETE is typed', async () => {
		render(DeleteAccountModal, { props: { open: true } });
		const confirm = screen.getByRole('button', { name: 'Delete account' });
		expect(confirm).toBeDisabled();
		await fireEvent.input(screen.getByLabelText(/type delete to confirm/i), {
			target: { value: 'delete' }
		});
		expect(confirm).toBeDisabled(); // case-sensitive
		await fireEvent.input(screen.getByLabelText(/type delete to confirm/i), {
			target: { value: 'DELETE' }
		});
		expect(confirm).toBeEnabled();
	});

	it('posts ?/requestDeletion', () => {
		const { container } = render(DeleteAccountModal, { props: { open: true } });
		expect(container.querySelector('form')).toHaveAttribute('action', '?/requestDeletion');
	});

	it('calls onclose on Cancel and on Escape', async () => {
		const onclose = vi.fn();
		render(DeleteAccountModal, { props: { open: true, onclose } });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(onclose).toHaveBeenCalledTimes(2);
	});

	it('calls ondeleted with the schedule on a successful submit', async () => {
		const ondeleted = vi.fn();
		render(DeleteAccountModal, { props: { open: true, ondeleted } });
		const post = hoisted.submit!();
		await post({
			result: {
				type: 'success',
				data: { deletion: { scheduled_deletion_at: '2026-07-01T00:00:00Z', grace_period_days: 30 } }
			}
		});
		expect(ondeleted).toHaveBeenCalledWith({
			scheduled_deletion_at: '2026-07-01T00:00:00Z',
			grace_period_days: 30
		});
	});

	it('shows an inline error on a failed submit', async () => {
		render(DeleteAccountModal, { props: { open: true } });
		const post = hoisted.submit!();
		await post({
			result: {
				type: 'failure',
				data: { deleteError: 'Could not schedule deletion. Please try again.' }
			}
		});
		expect(
			await screen.findByText('Could not schedule deletion. Please try again.')
		).toBeInTheDocument();
	});
});
