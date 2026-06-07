// All pdfjs-dist usage lives here, lazily imported so the ~1MB worker stays off
// the chat page's critical path. Browser-only — never called during SSR.

export interface RenderedPdf {
	numPages: number;
}

/**
 * Render every page of a PDF (canvas + selectable text layer) into `container`.
 * P3-2 will extend this to locate + highlight the cited span; P3-1 only renders.
 */
export async function renderPdf(container: HTMLElement, bytes: ArrayBuffer): Promise<RenderedPdf> {
	const pdfjs = await import('pdfjs-dist');
	const { TextLayer } = pdfjs;
	// Resolve the worker as a URL through Vite so it is emitted as a real asset.
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
	container.replaceChildren();

	try {
		for (let n = 1; n <= doc.numPages; n++) {
			const page = await doc.getPage(n);
			const viewport = page.getViewport({ scale: 1.4 });
			const w = Math.round(viewport.width);
			const h = Math.round(viewport.height);

			const pageEl = document.createElement('div');
			pageEl.className = 'pdf-page';
			pageEl.dataset.pageNumber = String(n);
			pageEl.style.position = 'relative';
			pageEl.style.width = `${w}px`;
			pageEl.style.height = `${h}px`;
			pageEl.style.margin = '0 auto 12px';

			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			pageEl.appendChild(canvas);

			const textLayerEl = document.createElement('div');
			textLayerEl.className = 'textLayer';
			pageEl.appendChild(textLayerEl);

			container.appendChild(pageEl);

			// v5 API: pass canvas as primary parameter (canvasContext is for legacy use)
			await page.render({ canvas, viewport }).promise;
			const textContent = await page.getTextContent();
			const textLayer = new TextLayer({
				textContentSource: textContent,
				container: textLayerEl,
				viewport
			});
			await textLayer.render();
		}
		return { numPages: doc.numPages };
	} finally {
		doc.destroy();
	}
}
