import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	return { isAdmin: !!event.locals.user?.is_admin };
};
