/**
 * Derive a backend-safe skill slug from a display name.
 * Lowercase, ascii [a-z0-9] words joined by single dashes, max 32 chars,
 * no leading/trailing dash. Matches the filesystem skill folder convention.
 */
export function deriveSlug(displayName: string): string {
	return displayName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → dash
		.replace(/^-+|-+$/g, '') // trim edge dashes
		.slice(0, 32)
		.replace(/-+$/g, ''); // re-trim a dash left dangling by the slice
}
