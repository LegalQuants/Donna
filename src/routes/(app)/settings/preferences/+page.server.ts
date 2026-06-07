import { isAutonomousEnabled } from '$lib/automations/optin.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	provenancePills: event.locals.user?.provenance_pills ?? 'always',
	trustPills: event.locals.user?.trust_pills ?? 'labels',
	autonomousEnabled: await isAutonomousEnabled(event)
});
