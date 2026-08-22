<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  import { onMount } from 'svelte'

  let { value, align = 'left' }: { value: unknown; align?: 'left' | 'center' | 'right' } = $props()
  let text = $derived(typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value))
  let trigger = $state<HTMLElement | null>(null)
  let truncated = $state(false)

  function measure() { if (trigger) truncated = trigger.scrollWidth > trigger.clientWidth }
  onMount(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (trigger) observer.observe(trigger)
    return () => observer.disconnect()
  })
</script>

<Tooltip.Provider>
  <Tooltip.Root disabled={!truncated}>
    <Tooltip.Trigger bind:ref={trigger} onmouseenter={measure} class={`block w-full min-w-0 truncate text-inherit ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${truncated ? 'cursor-help' : 'cursor-default'}`}>{text}</Tooltip.Trigger>
    <Tooltip.Content class="max-w-sm break-words">{text}</Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
