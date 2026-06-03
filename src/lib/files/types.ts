import type { components } from '$lib/api/backend';

/** Backend file metadata (named FileMeta so it doesn't shadow the DOM `File`). */
export type FileMeta = components['schemas']['File'];

/** A file the user has attached to a composer turn. */
export interface AttachedFile {
  localId: string;
  name: string;
  fileId: string | null;
  status: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
}
