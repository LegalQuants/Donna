// Single source of truth for "may use the compliance-review surface".
// Privileged reader set = {admin, auditor} (integration doc §2.6a).
export function canAudit(
	user: { role?: string | null; is_admin?: boolean } | null | undefined
): boolean {
	return !!user && (user.is_admin === true || user.role === 'auditor');
}
