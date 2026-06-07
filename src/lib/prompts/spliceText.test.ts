import { describe, it, expect } from 'vitest';
import { spliceText } from './spliceText';

describe('spliceText', () => {
	it('inserts at the cursor and returns the new caret position', () => {
		expect(spliceText('abcd', 2, 2, 'XY')).toEqual({ value: 'abXYcd', caret: 4 });
	});
	it('replaces a selection', () => {
		expect(spliceText('abcd', 1, 3, 'X')).toEqual({ value: 'aXd', caret: 2 });
	});
	it('appends when the range is at the end', () => {
		expect(spliceText('ab', 2, 2, 'cd')).toEqual({ value: 'abcd', caret: 4 });
	});
	it('fills an empty string', () => {
		expect(spliceText('', 0, 0, 'hi')).toEqual({ value: 'hi', caret: 2 });
	});
});
