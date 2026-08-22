<script lang="ts" generics="TId extends string | number">
  import RiAddLine from 'remixicon-svelte/icons/add-line'
  import RiCheckLine from 'remixicon-svelte/icons/check-line'
  import RiExpandUpDownLine from 'remixicon-svelte/icons/expand-up-down-line'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'

  type Item = { id: TId; label: string }
  let { label, items, value = $bindable(), oncreate }: { label: string; items: Item[]; value: TId; oncreate?: (label: string) => Promise<Item | null> } = $props()
  let open = $state(false)
  let createOpen = $state(false)
  let createValue = $state('')
  let creating = $state(false)
  let selected = $derived(items.find(item => item.id === value))

  function choose(item: Item) { value = item.id; open = false }
  function showCreate() { createValue = ''; open = false; createOpen = true }
  async function create(event: SubmitEvent) {
    event.preventDefault()
    if (!oncreate || !createValue.trim()) return
    creating = true
    const item = await oncreate(createValue.trim())
    creating = false
    if (item) { choose(item); createOpen = false }
  }
</script>

<div class="grid gap-1.5">
  <span class="text-sm font-medium">{label}</span>
  <Popover.Root bind:open>
    <Popover.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" class="w-full justify-between font-normal">{selected?.label ?? `Select ${label.toLowerCase()}…`}<RiExpandUpDownLine class="ml-2 size-4 opacity-50" /></Button>{/snippet}</Popover.Trigger>
    <Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
      <Command.Root>
        <Command.Input placeholder={`Type to filter ${label.toLowerCase()}…`} />
        <Command.List>
          <Command.Empty>No {label.toLowerCase()} found.</Command.Empty>
          <Command.Group>
            {#each items as item (item.id)}<Command.Item value={item.label} onSelect={() => choose(item)}><RiCheckLine class="mr-2 size-4 {item.id === value ? 'opacity-100' : 'opacity-0'}" />{item.label}</Command.Item>{/each}
          </Command.Group>
          {#if oncreate}<Command.Separator /><Command.Group><Command.Item value={`add-new-${label}`} onSelect={showCreate}><RiAddLine class="mr-2 size-4" />Add new {label}</Command.Item></Command.Group>{/if}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
</div>

<Dialog.Root bind:open={createOpen}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Add {label}</Dialog.Title><Dialog.Description>Create and select a new {label.toLowerCase()} without leaving this form.</Dialog.Description></Dialog.Header>
    <form class="grid gap-4" onsubmit={create}>
      <label class="grid gap-1.5"><span class="text-sm font-medium">Name</span><Input bind:value={createValue} required /></label>
      <Dialog.Footer><Button type="button" variant="outline" onclick={() => createOpen = false}>Cancel</Button><Button type="submit" disabled={creating}>{creating ? 'Creating…' : `Create ${label}`}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
