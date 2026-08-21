/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TeamSection from './TeamSection.svelte';
import type { DirectoryEntry, MatterMember, MatterRole } from '$lib/matters/types';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const member = (over: Partial<MatterMember> & { user_id: string }): MatterMember => ({
	email: `${over.user_id}@example.com`,
	display_name: null,
	role: 'contributor' as MatterRole,
	is_owner: false,
	added_by_user_id: 'u1',
	created_at: '2026-08-20T00:00:00Z',
	...over
});

const owner = member({ user_id: 'u1', display_name: 'Dana Okafor', role: 'lead', is_owner: true });
const ana = member({ user_id: 'u2', display_name: 'Ana', role: 'contributor' });
const luis = member({ user_id: 'u3', display_name: 'Luis', role: 'blocked' });

const dir: DirectoryEntry[] = [
	{ id: 'u1', email: 'u1@example.com', display_name: 'Dana Okafor' },
	{ id: 'u4', email: 'u4@example.com', display_name: 'Marta' }
];

const props = (over: Record<string, unknown> = {}) => ({
	members: [owner, ana],
	directory: dir,
	shareScope: 'personal' as const,
	canManage: true,
	...over
});

describe('TeamSection', () => {
	it('counts only the working team, not screened people', () => {
		render(TeamSection, { props: props({ members: [owner, ana, luis] }) });
		expect(screen.getByRole('heading', { name: /people · 2/i })).toBeInTheDocument();
	});

	it('marks the owner and does not offer to change or remove them', () => {
		render(TeamSection, { props: props() });
		expect(screen.getByText(/owner · lead/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /remove dana okafor/i })).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/role for dana okafor/i)).not.toBeInTheDocument();
	});

	it('gives a lead a role picker and a remove control per other member', () => {
		render(TeamSection, { props: props() });
		expect(screen.getByLabelText(/role for ana/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /remove ana/i })).toBeInTheDocument();
	});

	it('shows a non-lead the roster read-only', () => {
		render(TeamSection, { props: props({ canManage: false }) });
		expect(screen.getByText('Contributor')).toBeInTheDocument();
		expect(screen.queryByLabelText(/role for ana/i)).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /add someone/i })).not.toBeInTheDocument();
	});

	it('lists screened people apart from the team, with a Lift screen control', () => {
		render(TeamSection, { props: props({ members: [owner, ana, luis] }) });
		expect(screen.getByRole('heading', { name: /screened · 1/i })).toBeInTheDocument();
		expect(screen.getByText(/cannot see this matter/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /lift screen/i })).toBeInTheDocument();
	});

	it('calls a screened person Screened, never blocked', () => {
		render(TeamSection, { props: props({ members: [owner, ana, luis] }) });
		expect(screen.queryByText(/\bblocked\b/i)).not.toBeInTheDocument();
	});

	it('offers the share scope as a lead-editable control', () => {
		render(TeamSection, { props: props({ shareScope: 'org' }) });
		const select = screen.getByLabelText(/who can see this matter/i) as HTMLSelectElement;
		expect(select.value).toBe('org');
		expect(screen.getByText(/everyone at the firm can read it/i)).toBeInTheDocument();
	});

	it('shows a non-lead the share scope as text, not a control', () => {
		render(TeamSection, { props: props({ shareScope: 'org', canManage: false }) });
		expect(screen.queryByLabelText(/who can see this matter/i)).not.toBeInTheDocument();
		expect(screen.getByText('Everyone at the firm')).toBeInTheDocument();
	});

	it('points a lead at screening when a privileged matter is firm-wide', () => {
		render(TeamSection, { props: props({ shareScope: 'org', privileged: true }) });
		expect(screen.getByText(/a screen overrides firm-wide access/i)).toBeInTheDocument();
	});

	it('keeps people already on the roster out of the add picker', async () => {
		const user = userEvent.setup();
		render(TeamSection, { props: props({ members: [owner, ana, luis] }) });
		await user.click(screen.getByRole('button', { name: /add someone/i }));

		const options = Array.from((screen.getByLabelText('Person') as HTMLSelectElement).options).map(
			(o) => o.value
		);
		// u1 is already the owner; u2 and u3 are on the roster (u3 screened).
		expect(options).not.toContain('u1');
		expect(options).not.toContain('u3');
		expect(options).toContain('u4');
	});

	it('says so plainly when there is nobody left to add', () => {
		render(TeamSection, { props: props({ directory: [dir[0]] }) });
		expect(screen.getByText(/everyone in the firm is already on this matter/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /add someone/i })).not.toBeInTheDocument();
	});

	it('explains what the chosen role permits before you commit to it', async () => {
		const user = userEvent.setup();
		render(TeamSection, { props: props() });
		await user.click(screen.getByRole('button', { name: /add someone/i }));
		expect(screen.getByText(/can read the matter and add to it/i)).toBeInTheDocument();
	});

	it('surfaces an action error', () => {
		render(TeamSection, { props: props({ error: 'Only a matter lead can change who is on it.' }) });
		expect(screen.getByText(/only a matter lead/i)).toBeInTheDocument();
	});

	it('falls back to the email when someone has no display name', () => {
		render(TeamSection, { props: props({ members: [owner, member({ user_id: 'u9' })] }) });
		expect(screen.getByText('u9@example.com')).toBeInTheDocument();
	});
});
