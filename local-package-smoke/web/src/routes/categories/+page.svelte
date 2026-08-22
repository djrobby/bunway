<script lang="ts">
  import { onMount } from 'svelte'
  import { treaty } from '@elysiajs/eden'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import * as Table from '$lib/components/ui/table/index.js'
  import DateField from '$lib/components/date-field.svelte'
  import RowActions from '$lib/components/row-actions.svelte'
  import TruncatedCell from '$lib/components/truncated-cell.svelte'
  import ResizableHead from '$lib/components/resizable-head.svelte'
  import type { App } from '../../../../src/app'
  import type { Category } from '../../../../src/db/schema/categories'

  const api = treaty<App>('http://localhost:3000')
  let records = $state<Category[]>([])
  let form = $state({ name: '' })
  let editing = $state<Category['id'] | null>(null)
  let message = $state('')
  let total = $state(0)
  let page = $state(1)
  let perPage = $state('50')
  let filter = $state('')
  let filterTimer: ReturnType<typeof setTimeout>
  let sortField = $state('id')
  let sortOrder = $state<'asc' | 'desc'>('asc')
  let visible = $state({ name: true })
  let selectedIds = $state<Category['id'][]>([])
  let allSelected = $derived(
    records.length > 0 && records.every((record) => selectedIds.includes(record.id)),
  )
  let someSelected = $derived(
    !allSelected && records.some((record) => selectedIds.includes(record.id)),
  )
  let pageCount = $derived(perPage === 'all' ? 1 : Math.max(1, Math.ceil(total / Number(perPage))))
  let dialogOpen = $state(false)

  async function load() {
    const { data, error } = await api.categories.get({
      query: {
        page: String(page),
        perPage,
        filter: filter || undefined,
        sort: sortField,
        order: sortOrder,
      },
    })
    if (error) message = 'Could not load categories'
    else {
      records = data?.records ?? []
      total = data?.total ?? 0
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    const result =
      editing === null
        ? await api.categories.post(form)
        : await api.categories({ id: editing }).patch(form)
    if (result.error) message = 'Could not save category'
    else {
      cancel()
      await load()
    }
  }

  function edit(record: Category) {
    editing = record.id
    form = { name: record.name }
  }

  function openNew() {
    cancel()
    dialogOpen = true
  }
  function cancel() {
    dialogOpen = false
    editing = null
    form = { name: '' }
    message = ''
  }

  async function remove(id: Category['id']) {
    const { error } = await api.categories({ id }).delete()
    if (error) message = 'Could not delete category'
    else await load()
  }

  function scheduleFilter() {
    clearTimeout(filterTimer)
    filterTimer = setTimeout(async () => {
      page = 1
      await load()
    }, 250)
  }
  async function toggleSort(field: string) {
    sortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc'
    sortField = field
    page = 1
    await load()
  }
  function setColumn(field: string, shown: boolean) {
    visible = { ...visible, [field]: shown }
  }
  function toggleRow(id: Category['id'], checked: boolean) {
    selectedIds = checked
      ? [...new Set([...selectedIds, id])]
      : selectedIds.filter((value) => value !== id)
  }
  function toggleAll(checked: boolean) {
    const ids = records.map((record) => record.id)
    selectedIds = checked
      ? [...new Set([...selectedIds, ...ids])]
      : selectedIds.filter((id) => !ids.includes(id))
  }
  async function changePageSize(value: string | undefined) {
    if (!value) return
    perPage = value
    page = 1
    await load()
  }
  async function previousPage() {
    if (page > 1) {
      page -= 1
      await load()
    }
  }
  async function nextPage() {
    if (page < pageCount) {
      page += 1
      await load()
    }
  }
  onMount(load)
</script>

<svelte:head>
  <title>Categories</title>
</svelte:head>

<main class="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-8">
  <div class="flex items-end justify-between gap-4">
    <h1 class="text-4xl font-bold">Categories</h1>
    <Button type="button" onclick={openNew}>New Category</Button>
  </div>
  <Dialog.Root bind:open={dialogOpen}>
    <Dialog.Content class="sm:max-w-xl">
      <Dialog.Header>
        <Dialog.Title>{editing === null ? 'New' : 'Edit'} Category</Dialog.Title>
        <Dialog.Description>Enter the category details below.</Dialog.Description>
      </Dialog.Header>
      <form class="grid gap-4" onsubmit={save}>
        <label class="grid gap-1">
          <span class="text-sm font-medium">name</span>
          <input
            class="rounded-md border border-zinc-300 px-3 py-2"
            type="text"
            bind:value={form.name}
            required
          />
        </label>
        <div class="flex gap-2">
          <button class="rounded-md bg-zinc-900 px-4 py-2 text-white" type="submit">
            {editing === null ? 'Create' : 'Update'}
          </button>
          {#if editing !== null}
            <button class="rounded-md border px-4 py-2" type="button" onclick={cancel}>
              Cancel
            </button>
          {/if}
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Root>
  {#if message}
    <p class="mt-4 text-red-700">{message}</p>
  {/if}
  <div class="mt-6 flex flex-wrap items-center gap-2">
    <Input
      class="max-w-sm"
      placeholder="Filter categories…"
      bind:value={filter}
      oninput={scheduleFilter}
    />
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}<Button {...props} variant="outline" class="ml-auto">
            Columns
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Label>Show columns</DropdownMenu.Label>
        <DropdownMenu.CheckboxItem
          checked={visible.name}
          onCheckedChange={(checked) => setColumn('name', checked === true)}
          class="capitalize"
        >
          name
        </DropdownMenu.CheckboxItem>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
  <div class="mt-4 rounded-lg border bg-card text-card-foreground">
    <Table.Root class="w-max min-w-full table-fixed">
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-0 px-3 py-2">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(checked) => toggleAll(checked === true)}
              aria-label="Select all rows"
            />
          </Table.Head>
          {#if visible.name}
            <ResizableHead resource="categories" column="name" class="px-3 py-2 text-left">
              <button
                class="inline-flex items-center gap-1 font-medium"
                onclick={() => toggleSort('name')}
              >
                Name
                <span class="text-xs">
                  {sortField === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                </span>
              </button>
            </ResizableHead>
          {/if}
          <Table.Head class="w-0 whitespace-nowrap px-3 py-2 text-center">Actions</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each records as record (record.id)}
          <Table.Row
            class="border-t"
            data-state={selectedIds.includes(record.id) ? 'selected' : undefined}
          >
            <Table.Cell class="w-0 px-3 py-2">
              <Checkbox
                checked={selectedIds.includes(record.id)}
                onCheckedChange={(checked) => toggleRow(record.id, checked === true)}
                aria-label="Select row"
              />
            </Table.Cell>
            {#if visible.name}
              <Table.Cell class="max-w-0 px-3 py-2 text-left">
                <TruncatedCell value={record.name} />
              </Table.Cell>
            {/if}
            <Table.Cell class="w-0 whitespace-nowrap px-3 py-2 text-center">
              <RowActions
                label="Category"
                href={`/categories/${record.id}`}
                onedit={() => {
                  edit(record)
                  dialogOpen = true
                }}
                ondelete={() => remove(record.id)}
              />
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
  <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
    <span>
      {selectedIds.length} of {total} selected · {total}
      {total === 1 ? 'record' : 'records'}
    </span>
    <div class="flex items-center gap-2">
      <span>Rows</span>
      <Select.Root type="single" value={perPage} onValueChange={changePageSize}>
        <Select.Trigger class="w-24">{perPage === 'all' ? 'All' : perPage}</Select.Trigger>
        <Select.Content>
          <Select.Item value="50">50</Select.Item>
          <Select.Item value="100">100</Select.Item>
          <Select.Item value="250">250</Select.Item>
          <Select.Item value="all">All</Select.Item>
        </Select.Content>
      </Select.Root>
      {#if perPage !== 'all' && pageCount > 1}
        <Button variant="outline" size="sm" disabled={page <= 1} onclick={previousPage}>
          Previous
        </Button>
        <span>Page {page} of {pageCount}</span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onclick={nextPage}>
          Next
        </Button>
      {/if}
    </div>
  </div>
</main>
