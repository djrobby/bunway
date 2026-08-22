<script lang="ts">
  import { Input } from '$lib/components/ui/input/index.js'

  let { label, type = 'date', value = $bindable('') }: { label: string; type?: 'date' | 'datetime'; value?: string } = $props()
</script>

<label class="grid gap-1.5">
  <span class="text-sm font-medium capitalize">{label}</span>
  <Input type={type === 'datetime' ? 'datetime-local' : 'date'} bind:value required />
</label>
