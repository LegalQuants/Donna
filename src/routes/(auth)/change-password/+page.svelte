<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
  <h1 class="mb-2 text-center font-serif text-2xl text-mlq-strong">Set a new password</h1>
  <p class="mb-6 text-center text-sm text-mlq-muted">Your account requires a password change before continuing.</p>
  <form method="POST" use:enhance class="space-y-4">
    <input name="current_password" type="password" autocomplete="current-password" placeholder="Current password"
           class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none" />
    <input name="new_password" type="password" autocomplete="new-password" placeholder="New password"
           class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none" />
    <input name="confirm_password" type="password" autocomplete="new-password" placeholder="Confirm new password"
           class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none" />
    {#if form?.error}<p class="text-sm text-mlq-error">{form.error}</p>{/if}
    <button class="w-full rounded-mlq-control bg-mlq-strong py-2 text-white">Change password</button>
  </form>
</div>
