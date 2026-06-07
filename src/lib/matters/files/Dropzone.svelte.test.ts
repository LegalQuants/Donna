/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Dropzone from './Dropzone.svelte';

function makeDataTransfer(files: File[]): DataTransfer {
	// jsdom doesn't construct DataTransfer; minimal stub is enough for the drop event.
	return { files: files as unknown as FileList } as unknown as DataTransfer;
}

describe('Dropzone', () => {
	it('renders the prompt and is keyboard-focusable', () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		expect(btn).toBeInTheDocument();
		expect(btn).toHaveTextContent(/drag.*pdfs.*contracts.*click to browse/i);
	});

	it('clicking the prompt opens the hidden file input', async () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const input = screen.getByTestId('dropzone-input') as HTMLInputElement;
		const clickSpy = vi.spyOn(input, 'click');
		await userEvent.click(screen.getByRole('button', { name: /upload files/i }));
		expect(clickSpy).toHaveBeenCalled();
	});

	it('Enter key on the prompt opens the hidden file input', async () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const input = screen.getByTestId('dropzone-input') as HTMLInputElement;
		const clickSpy = vi.spyOn(input, 'click');
		const btn = screen.getByRole('button', { name: /upload files/i });
		btn.focus();
		await userEvent.keyboard('{Enter}');
		expect(clickSpy).toHaveBeenCalled();
	});

	it('dropping files emits onfiles with the File[] from the DataTransfer', () => {
		const onfiles = vi.fn();
		render(Dropzone, { props: { onfiles } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		const file = new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf' });
		fireEvent.drop(btn, { dataTransfer: makeDataTransfer([file]) });
		expect(onfiles).toHaveBeenCalledWith([file]);
	});

	it('toggles a dragging visual state on dragenter / dragleave', async () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		expect(btn.className).not.toMatch(/ring-2/);
		await fireEvent.dragEnter(btn);
		expect(btn.className).toMatch(/ring-2/);
		await fireEvent.dragLeave(btn);
		expect(btn.className).not.toMatch(/ring-2/);
	});

	it('prevents default on dragover so the drop event fires', () => {
		render(Dropzone, { props: { onfiles: vi.fn() } });
		const btn = screen.getByRole('button', { name: /upload files/i });
		const ev = new Event('dragover', { cancelable: true });
		btn.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
	});
});
