/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const base = { playbookItems: [], skillItems: [], kbs: [], matters: [] };

describe('/automations/new', () => {
	it('renders the gate when not opted in', () => {
		render(Page, { props: { data: { ...base, autonomousEnabled: false }, form: null } as never });
		expect(screen.getByText(/automations are off/i)).toBeInTheDocument();
	});
	it('renders the run form when opted in', () => {
		render(Page, { props: { data: { ...base, autonomousEnabled: true }, form: null } as never });
		expect(screen.getByRole('heading', { name: /run an automation/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument();
	});
});
