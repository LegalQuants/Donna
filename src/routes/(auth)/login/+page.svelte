<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
  <h1 class="mb-8 text-center font-serif text-3xl text-mlq-strong">Donna</h1>

  {#if form?.mfa}
    <form method="POST" action="?/mfa" use:enhance class="space-y-4">
      <input type="hidden" name="mfaToken" value={form.mfaToken} />
      <p class="text-sm text-mlq-text">Enter the 6-digit code from your authenticator app.</p>
      <input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456"
             class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 text-center tracking-widest outline-none" />
      {#if form?.error}<p class="text-sm text-mlq-error">{form.error}</p>{/if}
      <button class="w-full rounded-mlq-control bg-mlq-strong py-2 text-white">Verify</button>
    </form>
  {:else}
    <form method="POST" action="?/login" use:enhance class="space-y-4">
      <input name="email" type="email" autocomplete="username" placeholder="you@firm.com" value={form?.email ?? ''}
             class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none" />
      <input name="password" type="password" autocomplete="current-password" placeholder="Password"
             class="w-full rounded-mlq-control border border-mlq-subtle px-3 py-2 outline-none" />
      {#if form?.error}<p class="text-sm text-mlq-error">{form.error}</p>{/if}
      <button class="w-full rounded-mlq-control bg-mlq-strong py-2 text-white">Sign in</button>
    </form>
  {/if}
</div>
