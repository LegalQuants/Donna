export type DocTabStatus = 'loading' | 'ready' | 'error';

export interface DocTab {
  fileId: string;
  filename: string;
  mime: string;
  status: DocTabStatus;
  /** 1-based page the cited span lives on (used for highlight in P3-2). */
  page: number | null;
  /** Verbatim cited text (used for highlight in P3-2). */
  quote: string;
}
