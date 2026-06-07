/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ProviderKeyRowItem from './ProviderKeyRowItem.svelte';
import type { ProviderKeyRow } from './providerKeys';

const row = (over: Partial<ProviderKeyRow> = {}): ProviderKeyRow => ({
	provider: 'anthropic-prod',
	type: 'anthropic',
	configured: true,
	last4: 'a1b2',
	source: 'env',
	...over
});

describe('ProviderKeyRowItem', () => {
	it('unconfigured: shows "No key" and an Add key button, disabled until input', async () => {
		render(ProviderKeyRowItem, {
			props: { row: row({ configured: false, last4: null, source: null }) }
		});
		expect(screen.getByText('No key')).toBeInTheDocument();
		const btn = screen.getByRole('button', { name: 'Add key' });
		expect(btn).toBeDisabled();
		await fireEvent.input(screen.getByLabelText(/API key for anthropic-prod/i), {
			target: { value: 'sk-x' }
		});
		expect(btn).not.toBeDisabled();
	});

	it('runtime row: configured status with masked last4, Replace key label, and a two-step revoke', async () => {
		render(ProviderKeyRowItem, { props: { row: row({ source: 'runtime' }) } });
		expect(screen.getByText(/Configured · runtime · ••••a1b2/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument();
		// two-step revoke: Revoke → confirm UI
		await fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
		expect(screen.getByText('Revoke key?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm revoke' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText('Revoke key?')).toBeNull();
	});

	it('env row: environment label + managed-by-env hints, Replace key, NO revoke control', () => {
		render(ProviderKeyRowItem, { props: { row: row() } });
		expect(screen.getByText(/Configured · environment · ••••a1b2/)).toBeInTheDocument();
		expect(screen.getByText(/managed by your deployment's environment/)).toBeInTheDocument();
		expect(screen.getByText(/takes over management from the environment/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
	});

	it('masked input is a password field; null last4 renders without a bullet suffix', () => {
		render(ProviderKeyRowItem, { props: { row: row({ last4: null, source: 'runtime' }) } });
		const input = screen.getByLabelText(/API key for anthropic-prod/i) as HTMLInputElement;
		expect(input.type).toBe('password');
		expect(input.autocomplete).toBe('new-password');
		expect(screen.getByText(/Configured · runtime$/)).toBeInTheDocument();
	});

	it('renders a row-scoped error message when given one', () => {
		render(ProviderKeyRowItem, { props: { row: row(), error: 'Unknown provider.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Unknown provider.');
	});

	it('env-defined but empty: shows "Not set" + empty-variable note, not "No key"/managed-by-env', () => {
		render(ProviderKeyRowItem, {
			props: { row: row({ configured: false, last4: null, source: 'env' }) }
		});
		expect(screen.getByText('Not set')).toBeInTheDocument();
		expect(screen.queryByText('No key')).toBeNull();
		expect(screen.getByText(/variable is empty/)).toBeInTheDocument();
		expect(screen.queryByText(/managed by your deployment's environment/)).toBeNull();
		// takeover hint stays — saving a runtime key is the escape hatch
		expect(screen.getByText(/takes over management from the environment/)).toBeInTheDocument();
	});
});
