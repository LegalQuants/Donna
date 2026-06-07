/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import GenProgress from './GenProgress.svelte';

describe('GenProgress', () => {
	it('shows a preparing message', () => {
		render(GenProgress, { props: { phase: 'preparing' } });
		expect(screen.getByText(/Preparing documents/i)).toBeInTheDocument();
	});
	it('shows a generating message and the stuck hint', () => {
		render(GenProgress, { props: { phase: 'generating', stuck: true } });
		expect(screen.getByText(/Generating playbook/i)).toBeInTheDocument();
		expect(screen.getByText(/reload to resume/i)).toBeInTheDocument();
	});
	it('shows an error message', () => {
		render(GenProgress, { props: { phase: 'error', error: 'extraction failed' } });
		expect(screen.getByText(/extraction failed/)).toBeInTheDocument();
	});
});
