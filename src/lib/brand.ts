// Donna fronts the lq-ai backend. Some backend-provided display strings still
// carry the "LQ.AI" brand (e.g. the seeded admin's `display_name`). Users can now
// edit their own name via `PATCH /users/me` (Settings → Account), but until they
// do, we rebrand the token to "Donna" at render time. Applied to display names
// only, never to emails (the address `admin@lq.ai` is a real credential, not a
// brand label).
export function rebrandName(name: string | null | undefined): string {
  return name ? name.replace(/LQ\.?\s*AI/gi, 'Donna') : '';
}
