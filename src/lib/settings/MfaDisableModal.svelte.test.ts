/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import MfaDisableModal from './MfaDisableModal.svelte';

type FailData = { mfaError?: string };
type PostCb = (args: {
	result: { type: string; data?: FailData };
	update: () => Promise<void>;
}) => Promise<void>;
type SubmitFn = () => PostCb;

// Capture the use:enhance submit function so a test can drive a failure result
// through the component's real failure-handling code path.
const hoisted = vi.hoisted(() => ({ submit: undefined as SubmitFn | undefined }));
vi.mock('$app/forms', () => ({
	enhance: (_node: HTMLFormElement, submit: SubmitFn) => {
		hoisted.submit = submit;
		return {};
	}
}));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

async function submitFailure(data: FailData) {
	const post = hoisted.submit!();
	await post({ result: { type: 'failure', data }, update: async () => {} });
}

describe('MfaDisableModal', () => {
	it('renders nothing when closed', () => {
		render(MfaDisableModal, { props: { open: false } });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('renders password + code fields and a Disable submit posting ?/disableMfa', () => {
		const { container } = render(MfaDisableModal, { props: { open: true } });
		expect(screen.getByLabelText('Password')).toBeInTheDocument();
		expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
		expect(container.querySelector('form')).toHaveAttribute('action', '?/disableMfa');
	});

	it('calls onclose on Cancel', async () => {
		const onclose = vi.fn();
		render(MfaDisableModal, { props: { open: true, onclose } });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onclose).toHaveBeenCalled();
	});

	it('calls onclose on Escape key when open', async () => {
		const onclose = vi.fn();
		render(MfaDisableModal, { props: { open: true, onclose } });
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(onclose).toHaveBeenCalled();
	});

	it('calls onclose on backdrop click', async () => {
		const onclose = vi.fn();
		const { container } = render(MfaDisableModal, { props: { open: true, onclose } });
		const backdrop = container.querySelector('[role="presentation"]') as HTMLElement;
		await fireEvent.click(backdrop);
		expect(onclose).toHaveBeenCalled();
	});

	it('renders the error message after a failure result from enhance', async () => {
		render(MfaDisableModal, { props: { open: true } });
		await submitFailure({ mfaError: 'That password or code was incorrect.' });
		expect(await screen.findByText('That password or code was incorrect.')).toBeInTheDocument();
	});
});
