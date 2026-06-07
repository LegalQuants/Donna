// src/lib/automations/WatchList.svelte.test.ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WatchList from './WatchList.svelte';
import type { WatchSummary } from './watches';

const watch: WatchSummary = {
	id: 'w1',
	knowledge_base_id: 'kb1',
	playbook_id: 'p1',
	skill_ref: null,
	project_id: null,
	max_cost_usd: null,
	enabled: true
};

describe('WatchList', () => {
	it('renders an empty state with example use-cases', () => {
		render(WatchList, { props: { rows: [] } });
		expect(screen.getByText(/No watches yet/)).toBeInTheDocument();
		expect(screen.getByText(/Auto-summarize/i)).toBeInTheDocument();
	});
	it('renders one row per watch', () => {
		render(WatchList, { props: { rows: [{ watch, kb: 'Contracts KB', source: 'NDA Review' }] } });
		expect(screen.getByText('Contracts KB')).toBeInTheDocument();
		expect(screen.queryByText(/No watches yet/)).toBeNull();
	});
});
