<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { treaty } from '@elysiajs/eden'
  import type { App } from '../../../../../src/app'
  import type { Tag } from '../../../../../src/db/schema/tags'
  const api = treaty<App>('http://localhost:3000')
  let record = $state<Tag | null>(null)
  let message = $state('')
  onMount(async () => {
    const result = await api.tags({ id: page.params.id! }).get()
    if (result.error) message = 'Could not load tag'
    else record = result.data
  })
</script>

<svelte:head>
  <title>Tag details</title>
</svelte:head>
<main class="mx-auto max-w-3xl px-6 py-16">
  <a class="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/tags">← Back to Tags</a>
  {#if message}
    <p class="mt-8 rounded-md bg-red-50 p-3 text-red-700">{message}</p>
  {:else if record}
    <div class="mt-8 rounded-xl border bg-white p-6 shadow-sm">
      <p class="text-sm font-medium uppercase tracking-widest text-zinc-500">Tag</p>
      <h1 class="mt-2 text-4xl font-bold">Tag #{record.id}</h1>
      <dl class="mt-8">
        <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]">
          <dt class="text-sm font-medium capitalize text-zinc-500">name</dt>
          <dd>{record.name}</dd>
        </div>
      </dl>
    </div>
  {/if}
</main>
