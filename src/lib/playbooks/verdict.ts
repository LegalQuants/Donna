import type { Verdict, PositionResult, ResultSummary } from './types';

/** Verdicts ordered worst-first (drives result sorting + the scorecard). */
export const VERDICTS: Verdict[] = ['missing', 'deviates', 'matches_fallback', 'matches_standard'];

interface VerdictMeta {
  label: string;
  /** Tailwind classes: same-hue saturated text on a light tint of the same hue. */
  badgeClass: string;
}

const META: Record<Verdict, VerdictMeta> = {
  missing: { label: 'Missing', badgeClass: 'bg-mlq-error/15 text-mlq-error' },
  deviates: { label: 'Deviates', badgeClass: 'bg-mlq-caveats/20 text-mlq-caveats' },
  matches_fallback: { label: 'Fallback', badgeClass: 'bg-mlq-workflow/15 text-mlq-workflow' },
  matches_standard: { label: 'Standard', badgeClass: 'bg-mlq-verified/15 text-mlq-verified' }
};

export function verdictMeta(v: Verdict): VerdictMeta {
  return META[v];
}

export function compareByVerdict(a: PositionResult, b: PositionResult): number {
  return VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict);
}

/** Scorecard rows in worst-first order, with their summary counts. */
export const SUMMARY_ROWS: { verdict: Verdict; key: keyof ResultSummary }[] = VERDICTS.map((v) => ({
  verdict: v,
  key: v as keyof ResultSummary
}));
