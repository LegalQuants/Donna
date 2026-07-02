// src/lib/fiduciary/download.ts
// The client-side text-file download primitive (the codebase's existing exports
// are all server-route + <a href download>). Kept out of the pure serializer.
export function downloadTextFile(filename: string, mimeType: string, content: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
