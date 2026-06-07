/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ pathname: '/settings/account' }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL('http://localhost' + h.pathname);
		}
	}
}));

import SettingsRail from './SettingsRail.svelte';

describe('SettingsRail', () => {
	it('renders the Account section link', () => {
		h.pathname = '/settings/account';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
			'href',
			'/settings/account'
		);
	});

	it('marks Account active on /settings/account', () => {
		h.pathname = '/settings/account';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
	});

	it('renders the Data & privacy section link', () => {
		h.pathname = '/settings/account';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute(
			'href',
			'/settings/data'
		);
	});

	it('marks Data & privacy active on /settings/data', () => {
		h.pathname = '/settings/data';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	it('renders the Preferences section link', () => {
		h.pathname = '/settings/account';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
			'href',
			'/settings/preferences'
		);
	});

	it('marks Preferences active on /settings/preferences', () => {
		h.pathname = '/settings/preferences';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	it('renders the Trust section link', () => {
		h.pathname = '/settings/account';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Trust' })).toHaveAttribute('href', '/settings/trust');
	});

	it('marks Trust active on /settings/trust', () => {
		h.pathname = '/settings/trust';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Trust' })).toHaveAttribute('aria-current', 'page');
	});

	it('renders the Models section link', () => {
		h.pathname = '/settings/account';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute(
			'href',
			'/settings/models'
		);
	});

	it('marks Models active on /settings/models', () => {
		h.pathname = '/settings/models';
		render(SettingsRail);
		expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('aria-current', 'page');
	});
});
