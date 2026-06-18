import type { Citation } from '$lib/citations/types';

export type DocTabStatus = 'loading' | 'ready' | 'error';
export type HighlightStatus = 'pending' | 'found' | 'miss';

export interface DocTab {
	fileId: string;
	filename: string;
	mime: string;
	/** When set, the text viewer fetches this URL instead of /files/{fileId}/content
	 *  (used for external opinions, which are not Donna files). */
	contentUrl?: string;
	status: DocTabStatus;
	/** 1-based page the cited span lives on. */
	page: number | null;
	/** Verbatim cited text to highlight. */
	quote: string;
	/** The citation behind this tab — drives the panel's verification chip. */
	cite: Citation;
	/** Outcome of the highlight attempt for the current {page, quote}. */
	highlightStatus: HighlightStatus;
}
