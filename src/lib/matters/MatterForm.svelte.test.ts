import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MatterForm from './MatterForm.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

describe('MatterForm', () => {
	it('posts to the given action and disables submit until a name is typed', async () => {
		render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
		const form = screen.getByRole('form', { name: /matter/i });
		expect(form).toHaveAttribute('action', '?/create');
		const submit = screen.getByRole('button', { name: 'Create matter' });
		expect(submit).toBeDisabled();
		await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
		expect(submit).toBeEnabled();
	});

	it('seeds name and description in edit mode', () => {
		render(MatterForm, {
			props: {
				action: '?/rename',
				submitLabel: 'Save',
				name: 'Beta',
				description: 'Beta engagement'
			}
		});
		expect((screen.getByLabelText(/matter name/i) as HTMLInputElement).value).toBe('Beta');
		expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe(
			'Beta engagement'
		);
	});

	it('surfaces a server error message', () => {
		render(MatterForm, {
			props: {
				action: '?/create',
				submitLabel: 'Create matter',
				error: 'Could not create the matter.'
			}
		});
		expect(screen.getByText('Could not create the matter.')).toBeInTheDocument();
	});

	it('seeds privileged and minimumTier in edit mode', () => {
		render(MatterForm, {
			props: {
				action: '?/rename',
				submitLabel: 'Save',
				name: 'Beta',
				privileged: true,
				minimumTier: 4
			}
		});
		expect((screen.getByLabelText(/privileged matter/i) as HTMLInputElement).checked).toBe(true);
		expect((screen.getByLabelText(/minimum model tier/i) as HTMLSelectElement).value).toBe('4');
	});

	it('disables submit and shows the coupling hint when privileged is checked but no tier is selected', async () => {
		render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
		await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
		const submit = screen.getByRole('button', { name: 'Create matter' });
		expect(submit).toBeEnabled();
		await fireEvent.click(screen.getByLabelText(/privileged matter/i));
		expect(submit).toBeDisabled();
		expect(screen.getByText(/privileged matters require a minimum tier/i)).toBeInTheDocument();
	});

	it('re-enables submit once a tier is picked', async () => {
		render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
		await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
		await fireEvent.click(screen.getByLabelText(/privileged matter/i));
		await fireEvent.change(screen.getByLabelText(/minimum model tier/i), {
			target: { value: '4' }
		});
		expect(screen.getByRole('button', { name: 'Create matter' })).toBeEnabled();
		expect(
			screen.queryByText(/privileged matters require a minimum tier/i)
		).not.toBeInTheDocument();
	});

	it('non-privileged matters can submit with no tier selected', async () => {
		render(MatterForm, { props: { action: '?/create', submitLabel: 'Create matter' } });
		await fireEvent.input(screen.getByLabelText(/matter name/i), { target: { value: 'Acme MSA' } });
		expect(screen.getByRole('button', { name: 'Create matter' })).toBeEnabled();
	});
});
