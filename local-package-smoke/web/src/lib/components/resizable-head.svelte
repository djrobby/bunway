<script lang="ts">
  import { onMount } from 'svelte'
  import * as Table from '$lib/components/ui/table/index.js'
  let { resource, column, children, class: className = '' }: { resource: string; column: string; children: import('svelte').Snippet; class?: string } = $props()
  let width = $state<number | null>(null)
  const key = $derived(`bunway:${resource}:column-widths`)
  function save(next: number | null) {
    width = next
    const widths = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (next === null) delete widths[column]; else widths[column] = next
    localStorage.setItem(key, JSON.stringify(widths))
  }
  function resize(event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    const start = event.clientX
    const initial = handle.parentElement?.getBoundingClientRect().width ?? 120
    const move = (next: PointerEvent) => save(Math.max(64, initial + next.clientX - start))
    const stop = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }
  onMount(() => {
    width = JSON.parse(localStorage.getItem(key) ?? '{}')[column] ?? null
    const reset = () => save(null)
    window.addEventListener(`${key}:reset`, reset)
    return () => window.removeEventListener(`${key}:reset`, reset)
  })
</script>
<Table.Head class={`relative ${className}`} style={width ? `width:${width}px;min-width:${width}px;max-width:${width}px` : undefined}>
  {@render children()}
  <span role="separator" aria-orientation="vertical" title="Drag to resize; double-click to reset" class="group absolute inset-y-0 right-0 z-20 w-2 touch-none cursor-col-resize select-none" onpointerdown={resize} ondblclick={() => save(null)}><span class="pointer-events-none absolute inset-y-2 right-0 w-px bg-border/60 transition-colors group-hover:bg-primary/50"></span></span>
</Table.Head>
