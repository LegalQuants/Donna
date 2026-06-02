import type { ChatModelOption } from '$lib/models/types';

export interface TrustRow {
  id: string;
  label: string;
  where: 'Local' | 'Cloud';
  tone: 'local' | 'cloud';
  tier: number | null;
  meaning: string;
}

/** Shape normalized model options into rows for the Trust matrix. */
export function toTrustRows(options: ChatModelOption[]): TrustRow[] {
  return options.map((o) => {
    const local = o.group === 'local';
    return {
      id: o.id,
      label: o.label || o.id,
      where: local ? 'Local' : 'Cloud',
      tone: local ? 'local' : 'cloud',
      tier: o.tier,
      meaning: local ? 'Never leaves your environment' : 'Anonymized before leaving'
    };
  });
}
