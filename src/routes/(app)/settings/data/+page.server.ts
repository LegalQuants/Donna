import { fail, type Actions } from '@sveltejs/kit';
import { lqFetch } from '$lib/server/lqClient';
import { clearSessionCookies } from '$lib/server/session';
import type { ExportJob, DeletionSchedule } from '$lib/settings/dataPrivacy';

export const actions: Actions = {
  requestExport: async (event) => {
    const res = await lqFetch(event, '/api/v1/users/me/export', { method: 'POST' });
    if (!res.ok) return fail(502, { exportError: 'Could not start the export. Please try again.' });
    const job = (await res.json()) as ExportJob;
    return { export: job };
  },

  requestDeletion: async (event) => {
    const res = await lqFetch(event, '/api/v1/users/me/delete', { method: 'POST' });
    if (!res.ok) return fail(502, { deleteError: 'Could not schedule deletion. Please try again.' });
    const schedule = (await res.json()) as DeletionSchedule;
    // The backend revokes all sessions on delete; drop our now-stale cookies so
    // the next navigation lands cleanly on /login instead of bouncing via a 401.
    clearSessionCookies(event);
    return { deletion: schedule };
  },

  cancelDeletion: async (event) => {
    const res = await lqFetch(event, '/api/v1/users/me/delete/cancel', { method: 'POST' });
    if (res.ok) return { cancelled: true };
    if (res.status === 400) return fail(400, { cancelMessage: 'No scheduled deletion to cancel.' });
    return fail(502, { cancelError: 'Could not cancel. Please try again.' });
  }
};
