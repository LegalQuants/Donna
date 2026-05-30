/**
 * Friendly display title for a skill slug, for the applied-skills confirmation.
 * `contract-qa` → "Contract QA", `msa-review-saas` → "MSA Review SaaS".
 *
 * Pure and deterministic (no fetch): known acronyms get canonical casing,
 * every other word is title-cased. This is the loose inverse of
 * `deriveSlug` (authoring/deriveSlug.ts) — it won't always reproduce a
 * skill's exact backend display_name (e.g. parenthesised forms), but stays
 * close and plain-language, which suits a low-stakes footer label.
 */
const ACRONYMS: Record<string, string> = {
  msa: 'MSA',
  nda: 'NDA',
  dpa: 'DPA',
  qa: 'QA',
  saas: 'SaaS',
  sow: 'SOW',
  baa: 'BAA',
  gdpr: 'GDPR'
};

export function prettifySkillSlug(slug: string): string {
  return slug
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
