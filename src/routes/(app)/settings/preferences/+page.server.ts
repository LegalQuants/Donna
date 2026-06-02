import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
  provenancePills: locals.user?.provenance_pills ?? 'always',
  trustPills: locals.user?.trust_pills ?? 'labels'
});
