import type { components } from '$lib/api/backend';

export type KnowledgeBase = components['schemas']['KnowledgeBase'];
export type KBFile = components['schemas']['KBFile'];

/**
 * Client-side shape for a file uploaded but not yet attached to the KB.
 * Lives in `KbFilesSection`'s `$state.pendingUploads` until the poll loop
 * sees `ingestion_status='ready'` and the auto-attach succeeds, at which
 * point the next `invalidateAll()` lands the file in the server-supplied
 * `KBFile[]` list and the pending row is filtered out.
 */
export type PendingUpload = {
  file_id: string;
  filename: string;
  size_bytes: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  ingestion_error?: string | null;
};
