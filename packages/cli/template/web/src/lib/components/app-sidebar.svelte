<script lang="ts">
  import { page } from '$app/state'
  import RiDatabase2Line from 'remixicon-svelte/icons/database-2-line'
  import RiArticleLine from 'remixicon-svelte/icons/article-line'
  import RiBriefcaseLine from 'remixicon-svelte/icons/briefcase-line'
  import RiCalendarLine from 'remixicon-svelte/icons/calendar-line'
  import RiCheckboxCircleLine from 'remixicon-svelte/icons/checkbox-circle-line'
  import RiChat3Line from 'remixicon-svelte/icons/chat-3-line'
  import RiFolderLine from 'remixicon-svelte/icons/folder-line'
  import RiFlashlightLine from 'remixicon-svelte/icons/flashlight-line'
  import RiPriceTag3Line from 'remixicon-svelte/icons/price-tag-3-line'
  import RiReceiptLine from 'remixicon-svelte/icons/receipt-line'
  import RiSettings3Line from 'remixicon-svelte/icons/settings-3-line'
  import RiShoppingBag3Line from 'remixicon-svelte/icons/shopping-bag-3-line'
  import RiUser3Line from 'remixicon-svelte/icons/user-3-line'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { resources } from '$lib/resources'

  const icons: Record<string, typeof RiDatabase2Line> = { article: RiArticleLine, briefcase: RiBriefcaseLine, calendar: RiCalendarLine, checkbox: RiCheckboxCircleLine, chat: RiChat3Line, database: RiDatabase2Line, folder: RiFolderLine, 'price-tag': RiPriceTag3Line, receipt: RiReceiptLine, settings: RiSettings3Line, 'shopping-bag': RiShoppingBag3Line, user: RiUser3Line }
  function isActive(href: string) { return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`) }
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <Sidebar.Menu><Sidebar.MenuItem><Sidebar.MenuButton size="lg" tooltipContent="Bunway">
      {#snippet child({ props })}<a href="/" {...props}><span class="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><RiFlashlightLine class="size-4" /></span><span class="grid text-left leading-tight group-data-[collapsible=icon]:hidden"><strong>Bunway</strong><small class="text-muted-foreground">Application</small></span></a>{/snippet}
    </Sidebar.MenuButton></Sidebar.MenuItem></Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Resources</Sidebar.GroupLabel>
      <Sidebar.GroupContent><Sidebar.Menu>
        {#each resources as resource (resource.href)}
          {@const Icon = icons[resource.icon] ?? RiDatabase2Line}
          <Sidebar.MenuItem><Sidebar.MenuButton tooltipContent={resource.label} isActive={isActive(resource.href)}>
            {#snippet child({ props })}<a href={resource.href} {...props}><Icon /><span class="group-data-[collapsible=icon]:hidden">{resource.label}</span></a>{/snippet}
          </Sidebar.MenuButton></Sidebar.MenuItem>
        {:else}
          <Sidebar.MenuItem><Sidebar.MenuButton tooltipContent="No scaffolds yet" aria-disabled="true"><RiDatabase2Line /><span>No scaffolds yet</span></Sidebar.MenuButton></Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu></Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer><p class="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Generated with Bunway</p></Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
