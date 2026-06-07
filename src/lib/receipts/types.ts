export type ReceiptKind = 'message' | 'retrieval' | 'inference' | 'skill' | 'audit' | 'error';

/** One event from GET /chats/{id}/receipts. `detail` is free-form per kind. */
export interface ReceiptEvent {
	ts: string;
	kind: ReceiptKind | (string & {});
	detail: Record<string, unknown>;
}
