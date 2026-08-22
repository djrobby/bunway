<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { treaty } from '@elysiajs/eden'
  import type { App } from '../../../../../src/app'
  import type { Product } from '../../../../../src/db/schema/products'
  const api = treaty<App>('http://localhost:3000')
  type ProductRecord = Product & { tagsIds: Array<string | number> }
  let record = $state<ProductRecord | null>(null)
  let message = $state('')
  onMount(async () => {
    const result = await api.products({ id: page.params.id! }).get()
    if (result.error) message = 'Could not load product'
    else record = result.data
  })
</script>

<svelte:head>
  <title>Product details</title>
</svelte:head>
<main class="mx-auto max-w-3xl px-6 py-16">
  <a class="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/products">
    ← Back to Products
  </a>
  {#if message}
    <p class="mt-8 rounded-md bg-red-50 p-3 text-red-700">{message}</p>
  {:else if record}
    <div class="mt-8 rounded-xl border bg-white p-6 shadow-sm">
      <p class="text-sm font-medium uppercase tracking-widest text-zinc-500">Product</p>
      <h1 class="mt-2 text-4xl font-bold">Product #{record.id}</h1>
      <dl class="mt-8">
        <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]">
          <dt class="text-sm font-medium capitalize text-zinc-500">name</dt>
          <dd>{record.name}</dd>
        </div>
        <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]">
          <dt class="text-sm font-medium capitalize text-zinc-500">category</dt>
          <dd>
            <a
              class="font-medium text-primary hover:underline"
              href={`/categories/${record.categoryId}`}
            >
              {record.categoryId}
            </a>
          </dd>
        </div>
        <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]">
          <dt class="text-sm font-medium capitalize text-zinc-500">tags</dt>
          <dd class="flex flex-wrap gap-2">
            {#each record.tagsIds as relatedId}
              <a class="font-medium text-primary hover:underline" href={`/tags/${relatedId}`}>
                {relatedId}
              </a>
            {:else}
              <span class="text-zinc-500">None</span>
            {/each}
          </dd>
        </div>
      </dl>
    </div>
  {/if}
</main>
