import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTextFile } from './download';

afterEach(() => vi.restoreAllMocks());

describe('downloadTextFile', () => {
	it('creates an object URL, clicks a download anchor with the given name, and revokes the URL', () => {
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		let clicked: HTMLAnchorElement | null = null;
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement
		) {
			// eslint-disable-next-line @typescript-eslint/no-this-alias -- capturing the clicked anchor to assert on afterward is the point of this spy
			clicked = this;
		});

		downloadTextFile('record.json', 'application/json', '{"a":1}');

		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
		expect(click).toHaveBeenCalledOnce();
		expect(clicked!.download).toBe('record.json');
		expect(clicked!.getAttribute('href')).toBe('blob:mock');
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
	});
});
