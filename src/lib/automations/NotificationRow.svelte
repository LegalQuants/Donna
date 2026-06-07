<script lang="ts">
  import type { NotificationItem } from './types';
  import { formatWhen } from './display';
  import { enhance } from '$app/forms';
  let { notification }: { notification: NotificationItem } = $props();
  const unread = $derived(notification.read_at === null);
</script>

<div class="flex items-start gap-3 rounded-mlq-control border border-mlq-subtle p-3 {unread ? 'bg-mlq-subtle/30' : ''}">
  {#if unread}<span aria-hidden="true" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mlq-workflow"></span>{/if}
  <div class="min-w-0 flex-1">
    <a href="/automations/{notification.session_id}" class="text-sm font-medium text-mlq-text hover:underline">{notification.title}</a>
    <p class="truncate text-xs text-mlq-muted">{notification.body}</p>
    <span class="text-[11px] text-mlq-muted">{notification.channel} · {formatWhen(notification.created_at)}</span>
  </div>
  {#if unread}
    <form method="POST" action="?/markRead" use:enhance>
      <input type="hidden" name="id" value={notification.id} />
      <button type="submit" class="shrink-0 text-xs text-mlq-muted hover:text-mlq-text">Mark read</button>
    </form>
  {/if}
</div>
