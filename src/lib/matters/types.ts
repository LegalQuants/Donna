import type { components } from '$lib/api/backend';

/** A matter is a backend "project". */
export type Matter = components['schemas']['Project'];
export type MatterSummary = Pick<Matter, 'id' | 'name'>;

/** Richer view for the chat header — carries privilege + tier-floor so the
 *  chat page can render the PrivilegedChip and pass minimumTier to ModelPicker. */
export interface MatterHeaderInfo {
	id: string;
	name: string;
	privileged: boolean;
	minimumTier: 1 | 2 | 3 | 4 | 5 | null;
}

/** Drop the per-user sandbox project; the list/picker only show real matters.
 *
 *  Generic over the matter shape so callers that read the sharing fields
 *  (see `SharedMatter`) do not lose them to a widening return type.
 */
export function activeMatters<T extends Matter>(projects: T[]): T[] {
	return projects.filter((p) => !p.is_sandbox);
}

/** Roles on a matter's roster (`project_members.role`).
 *
 *  `blocked` is a *negative* grant — an ethical screen. The backend resolver
 *  evaluates it before every allow, so it overrides firm-wide scope and
 *  operator-admin alike. The UI calls it "Screened", which is the term a
 *  lawyer will recognise; "blocked" is only ever the wire value.
 */
export type MatterRole = 'lead' | 'contributor' | 'reader' | 'blocked';

/** Ambient grant over a matter (`projects.share_scope`). */
export type ShareScope = 'personal' | 'members' | 'org';

/** What the caller may do on a matter (`ProjectResponse.caller_access`). */
export type MatterAccess = 'read' | 'write' | 'lead';

/** A colleague, as `GET /api/v1/users/directory` returns them. */
export interface DirectoryEntry {
	id: string;
	email: string;
	display_name: string | null;
}

/** Display name if there is one, otherwise the email. */
export function personLabel(p: { display_name?: string | null; email: string }): string {
	return p.display_name?.trim() || p.email;
}

/** One row of a matter's roster. */
export interface MatterMember {
	user_id: string;
	email: string;
	display_name: string | null;
	role: MatterRole;
	is_owner: boolean;
	added_by_user_id: string;
	created_at: string;
}

/** Matter fields added by the membership work.
 *
 *  Declared here rather than read from `backend.d.ts` because those types are
 *  generated from the pinned `vendor/lq-ai` OpenAPI sketch; they fold in at
 *  the next pin bump. Everything is optional so the UI degrades cleanly
 *  against an API that predates them.
 */
export interface MatterSharing {
	share_scope?: ShareScope;
	caller_access?: MatterAccess;
	caller_access_basis?: 'owner' | 'member' | 'org' | 'no_grant';
}

export type SharedMatter = Matter & MatterSharing;

/** True when the caller may manage the roster and the share scope. */
export function canManageMatter(matter: SharedMatter): boolean {
	return matter.caller_access === 'lead';
}

/** True when the caller may edit the matter's content. */
export function canEditMatter(matter: SharedMatter): boolean {
	return matter.caller_access === 'lead' || matter.caller_access === 'write';
}

/** True when the matter reached the caller through someone else's sharing.
 *
 *  Drives the "Shared" chip on the matter list. Keyed on the basis rather
 *  than `owner_id` so the answer stays right for a lead who is not the owner.
 */
export function isSharedWithCaller(matter: SharedMatter): boolean {
	return matter.caller_access_basis === 'member' || matter.caller_access_basis === 'org';
}

/** Human labels for roster roles. */
export const MATTER_ROLE_LABELS: Record<MatterRole, string> = {
	lead: 'Lead',
	contributor: 'Contributor',
	reader: 'Reader',
	blocked: 'Screened'
};

/** What each role actually permits, shown next to the picker so staffing a
 *  matter does not require reading the API docs. */
export const MATTER_ROLE_HINTS: Record<MatterRole, string> = {
	lead: 'Full control, including who else is on the matter.',
	contributor: 'Can read the matter and add to it.',
	reader: 'Can read the matter. Cannot change it.',
	blocked: 'Screened off. Cannot see the matter at all, whatever else grants access.'
};

export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
	personal: 'Just me',
	members: 'Named people only',
	org: 'Everyone at the firm'
};

export const SHARE_SCOPE_HINTS: Record<ShareScope, string> = {
	personal: 'Only you and anyone you add below.',
	members: 'Only the people listed below.',
	org: 'Everyone at the firm can read it. Contributing still needs a place on the list.'
};
