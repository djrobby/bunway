<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Input } from '$lib/components/ui/input/index.js'

  export type EditField = {
    key: string
    label: string
    kind?: 'text' | 'number' | 'boolean' | 'date' | 'time' | 'datetime' | 'file' | 'ids'
    relation?: string
    idKind?: 'string' | 'number'
  }

  let { endpoint, record, fields, onupdated }: {
    endpoint: string
    record: Record<string, unknown>
    fields: EditField[]
    onupdated: (record: Record<string, unknown>) => void
  } = $props()
  let open = $state(false)
  let values = $state<Record<string, unknown>>({})
  let message = $state('')

  function inputValue(field: EditField) {
    const value = record[field.key]
    if (field.kind === 'ids') return ((value as unknown[] | undefined) ?? []).join(', ')
    if (field.kind === 'boolean') return Boolean(value)
    if (field.kind === 'date') return String(value ?? '').slice(0, 10)
    if (field.kind === 'datetime') return String(value ?? '').slice(0, 16)
    return value ?? ''
  }

  function begin() {
    values = Object.fromEntries(fields.map((field) => [field.key, inputValue(field)]))
    message = ''
    open = true
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    const scalarFields = fields.filter((field) => field.kind !== 'ids')
    const hasFile = scalarFields.some((field) => field.kind === 'file' && values[field.key] instanceof File)
    let body: BodyInit
    const headers: HeadersInit = {}
    if (hasFile) {
      const form = new FormData()
      for (const field of scalarFields) {
        const value = values[field.key]
        if (field.kind === 'file' && !(value instanceof File)) continue
        form.set(field.key, value instanceof File ? value : String(value ?? ''))
      }
      body = form
    } else {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(Object.fromEntries(scalarFields.filter((field) => field.kind !== 'file').map((field) => [field.key, field.kind === 'number' ? Number(values[field.key]) : field.kind === 'boolean' ? Boolean(values[field.key]) : values[field.key] || null])))
    }
    const resourceUrl = endpoint.startsWith('http') ? endpoint : `http://localhost:3000${endpoint}`
    const response = await fetch(`${resourceUrl}/${record.id}`, { method: 'PATCH', headers, body })
    if (!response.ok) { message = 'Could not update record'; return }
    let updated = await response.json() as Record<string, unknown>
    for (const field of fields.filter((item) => item.kind === 'ids')) {
      const rawIds = String(values[field.key] ?? '').split(',').map((id) => id.trim()).filter(Boolean)
      const ids = field.idKind === 'number' ? rawIds.map(Number) : rawIds
      const association = await fetch(`${resourceUrl}/${record.id}/${field.relation}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) })
      if (!association.ok) { message = `Could not update ${field.label}`; return }
      updated = { ...updated, [field.key]: ids }
    }
    onupdated(updated)
    open = false
  }
</script>

<Button type="button" onclick={begin}>Edit</Button>
<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header><Dialog.Title>Edit record</Dialog.Title><Dialog.Description>Update this record without leaving the detail page.</Dialog.Description></Dialog.Header>
    <form class="grid gap-4" onsubmit={save}>
      {#each fields as field}
        {#if field.kind === 'boolean'}
          <label class="flex items-center gap-2"><input type="checkbox" checked={Boolean(values[field.key])} onchange={(event) => values[field.key] = event.currentTarget.checked} /><span>{field.label}</span></label>
        {:else if field.kind === 'file'}
          <label class="grid gap-1"><span class="text-sm font-medium">{field.label}</span><Input type="file" onchange={(event) => values[field.key] = event.currentTarget.files?.[0]} /></label>
        {:else}
          <label class="grid gap-1"><span class="text-sm font-medium">{field.label}</span><Input type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'time' ? 'time' : field.kind === 'datetime' ? 'datetime-local' : 'text'} value={String(values[field.key] ?? '')} oninput={(event) => values[field.key] = event.currentTarget.value} /></label>
        {/if}
      {/each}
      {#if message}<p class="text-sm text-destructive">{message}</p>{/if}
      <Dialog.Footer><Button type="button" variant="outline" onclick={() => open = false}>Cancel</Button><Button type="submit">Save</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
