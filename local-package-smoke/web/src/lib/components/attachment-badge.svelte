<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'

  export type AttachmentItem = { id: number; filename: string; contentType: string; byteSize: number; url: string }
  let { label, items, onremove }: { label: string; items: AttachmentItem[]; onremove?: (id: number) => Promise<void> | void } = $props()
  let open = $state(false)
</script>

<Dialog.Root bind:open>
  <button
    type="button"
    class={`relative inline-flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${items.length ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/50 text-muted-foreground'}`}
    title={`${items.length} ${label.toLowerCase()} attachment${items.length === 1 ? '' : 's'}`}
    onclick={() => (open = true)}
  >
    {#if items.length}
      <span class="attachment-ripple" aria-hidden="true"></span>
      <span class="attachment-ripple attachment-ripple-delayed" aria-hidden="true"></span>
    {/if}
    <span class="relative z-10">{items.length}</span>
  </button>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header><Dialog.Title>{label} attachments</Dialog.Title><Dialog.Description>{items.length ? `${items.length} attached file${items.length === 1 ? '' : 's'}.` : 'No files attached.'}</Dialog.Description></Dialog.Header>
    <div class="grid max-h-[65vh] gap-4 overflow-y-auto">
      {#each items as item (item.id)}
        <div class="rounded-md border p-3">
          {#if item.contentType.startsWith('image/')}
            <img class="max-h-96 w-full rounded object-contain" src={item.url} alt={item.filename} />
          {:else}
            <a class="font-medium underline" href={item.url} target="_blank" rel="noreferrer">{item.filename}</a>
          {/if}
          <div class="mt-2 flex items-center justify-between gap-3 text-sm"><span class="truncate">{item.filename}</span>{#if onremove}<Button variant="destructive" size="sm" onclick={() => onremove?.(item.id)}>Remove</Button>{/if}</div>
        </div>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .attachment-ripple {
    position: absolute;
    inset: -1px;
    border: 1px solid rgb(16 185 129 / 0.7);
    border-radius: 9999px;
    pointer-events: none;
    animation: attachment-ripple 2s ease-out infinite;
  }

  .attachment-ripple-delayed {
    animation-delay: 1s;
  }

  @keyframes attachment-ripple {
    from { opacity: 0.7; transform: scale(1); }
    to { opacity: 0; transform: scale(1.9); }
  }

  @media (prefers-reduced-motion: reduce) {
    .attachment-ripple { animation: none; opacity: 0; }
  }
</style>
