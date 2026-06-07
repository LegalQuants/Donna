// Shared shapes for the P7-2 Data & privacy flows. The backend returns these
// inline (they are not named schemas in backend.d.ts), so we mirror them here.

export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExportJob {
	job_id: string;
	status: ExportStatus;
	download_url?: string | null;
}

export interface DeletionSchedule {
	scheduled_deletion_at: string;
	grace_period_days: number;
}
