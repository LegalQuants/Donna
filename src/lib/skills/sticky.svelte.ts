// Per-chat "sticky skills" controller (Svelte 5 runes). Mirrors the LQ-AI reference's
// stickyEnabled/stickyDirty: `enabled` is INDEPENDENT state (seeded from the chat's set length, then
// flipped by the toggle), so the switch reflects user intent before the next send reconciles the set.
// `set_sticky` is sent to the backend ONLY when the user flipped the toggle this turn (sendValue()
// returns dirty ? enabled : undefined) — sending it every turn would re-snapshot and break the
// "union for the turn, set unchanged" invariant.
export function createStickySkills() {
	let enabled = $state(false);
	let set = $state<string[]>([]);
	let dirty = $state(false);
	// Internal, non-reactive: the last chat id we synced from, so syncFromChat only acts on a change.
	let syncedChatId: string | null = null;

	const union = (a: string[], b: string[]): string[] => Array.from(new Set([...a, ...b]));

	return {
		get enabled() {
			return enabled;
		},
		get set() {
			return set;
		},
		get dirty() {
			return dirty;
		},
		// Re-seed from a freshly-loaded chat, but ONLY when the chat id changes — so a reactive re-run
		// never clobbers an in-progress toggle, and a new chat starts off.
		syncFromChat(chatId: string, stickySkills: string[]) {
			if (chatId === syncedChatId) return;
			syncedChatId = chatId;
			set = [...stickySkills];
			enabled = stickySkills.length > 0;
			dirty = false;
		},
		// Flip the switch. `currentTurnSkills` are this turn's per-turn attached skills, used to
		// optimistically show the "Keeping N on" count until the next load reconciles the real set.
		toggle(currentTurnSkills: string[]) {
			enabled = !enabled;
			dirty = true;
			set = enabled ? union(currentTurnSkills, set) : [];
		},
		// The set_sticky value to send THIS turn — only when the toggle was flipped since the last send.
		sendValue(): boolean | undefined {
			return dirty ? enabled : undefined;
		},
		// Clear the flip flag after a send that carried set_sticky was accepted.
		markSent() {
			dirty = false;
		}
	};
}
