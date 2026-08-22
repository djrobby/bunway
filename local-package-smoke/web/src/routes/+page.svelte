<script lang="ts">
  import { treaty } from '@elysiajs/eden'
  import type { App } from '../../../src/app'

  const api = treaty<App>('http://localhost:3000')
  let status = $state('Check API')

  async function check() {
    const { data, error } = await api.get()
    status = error ? 'API unavailable' : `${data?.name}: ${data?.status}`
  }
</script>

<main class="mx-auto max-w-2xl px-6 py-24">
  <p class="mb-2 text-sm font-medium uppercase tracking-widest text-zinc-500">Bun + Elysia + SvelteKit</p>
  <h1 class="text-5xl font-bold tracking-tight">Bunway</h1>
  <p class="mt-5 text-lg text-zinc-600">A small application, ready for the useful work.</p>
  <button class="mt-8 rounded-md bg-primary px-4 py-2 text-primary-foreground shadow-sm" onclick={check}>{status}</button>
</main>
