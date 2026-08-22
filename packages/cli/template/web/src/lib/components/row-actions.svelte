<script lang="ts">
  import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line'
  import RiEditLine from 'remixicon-svelte/icons/edit-line'
  import RiEyeLine from 'remixicon-svelte/icons/eye-line'
  import RiMore2Line from 'remixicon-svelte/icons/more-2-line'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'

  let { label, href, onedit, ondelete }: { label: string; href?: string; onedit?: () => void; ondelete?: () => void } = $props()
  let confirmOpen = $state(false)

  function confirmDelete() { ondelete?.(); confirmOpen = false }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label={`${label} actions`}><RiMore2Line /></Button>{/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Label>Actions</DropdownMenu.Label>
    {#if href}<DropdownMenu.Item><a class="flex w-full items-center gap-2" {href}><RiEyeLine />View</a></DropdownMenu.Item>{/if}
    {#if onedit}<DropdownMenu.Item onclick={onedit}><RiEditLine />Edit</DropdownMenu.Item>{/if}
    {#if ondelete}<DropdownMenu.Separator /><DropdownMenu.Item class="text-destructive focus:text-destructive" onclick={() => confirmOpen = true}><RiDeleteBinLine />Delete</DropdownMenu.Item>{/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
{#if ondelete}<Dialog.Root bind:open={confirmOpen}><Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>Delete {label}?</Dialog.Title><Dialog.Description>Are you sure? This action cannot be undone.</Dialog.Description></Dialog.Header><Dialog.Footer><Button variant="outline" onclick={() => confirmOpen = false}>Cancel</Button><Button variant="destructive" onclick={confirmDelete}>Delete</Button></Dialog.Footer></Dialog.Content></Dialog.Root>{/if}
