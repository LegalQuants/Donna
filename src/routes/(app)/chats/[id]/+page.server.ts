import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const draft = cookies.get('donna_draft') ?? null;
  if (draft) cookies.delete('donna_draft', { path: '/' });
  return { chatId: params.id, draft };
};
