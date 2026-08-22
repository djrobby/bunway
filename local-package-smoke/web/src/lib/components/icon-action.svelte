<script lang="ts">
  import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line'
  import RiEditLine from 'remixicon-svelte/icons/edit-line'
  import RiEyeLine from 'remixicon-svelte/icons/eye-line'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  let { label, icon, onclick, href }: { label: string; icon: 'view' | 'edit' | 'delete'; onclick?: () => void; href?: string } = $props()
</script>

<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger>
      <Button variant="ghost" size="icon-sm" {href} {onclick} class={icon === 'delete' ? 'hover:text-destructive' : ''}>
        {#if icon === 'view'}<RiEyeLine />{:else if icon === 'edit'}<RiEditLine />{:else}<RiDeleteBinLine />{/if}
        <span class="sr-only">{label}</span>
      </Button>
    </Tooltip.Trigger>
    <Tooltip.Content>{label}</Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
