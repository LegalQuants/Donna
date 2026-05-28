import type { ChatModelOption } from './types';

/** Return the id of the model the chat should use, given the matter's
 *  minimum_inference_tier floor. If the current selection satisfies the floor
 *  (or there is no floor), return it unchanged. Otherwise prefer "smart" when
 *  it's valid; else the highest-tier valid option; else leave the current
 *  selection in place (degenerate; the gateway will refuse server-side). */
export function pickValidModel(
  options: ChatModelOption[],
  currentId: string,
  minimumTier: 1 | 2 | 3 | 4 | 5 | null
): string {
  if (minimumTier == null) return currentId;
  const valid = (o: ChatModelOption) => o.tier == null || o.tier >= minimumTier;
  const current = options.find((o) => o.id === currentId);
  if (current && valid(current)) return currentId;
  const smart = options.find((o) => o.id === 'smart');
  if (smart && valid(smart)) return 'smart';
  const validOptions = options.filter(valid);
  if (validOptions.length === 0) return currentId;
  // Highest tier first; null-tier options sort last so they don't displace a
  // concrete cloud match (and they were already handled by `valid`).
  validOptions.sort((a, b) => (b.tier ?? -1) - (a.tier ?? -1));
  return validOptions[0].id;
}
