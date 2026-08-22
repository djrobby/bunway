<script lang="ts">
  import '../app.css'
  import AppSidebar from '$lib/components/app-sidebar.svelte'
  import ThemeToggle from '$lib/components/theme-toggle.svelte'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  let { children } = $props()
</script>

<Sidebar.Provider>
  <AppSidebar />
  <Sidebar.Inset>
    <header class="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
      <div class="flex items-center gap-2"><Sidebar.Trigger /><span class="text-sm font-medium text-muted-foreground">Application</span></div>
      <ThemeToggle />
    </header>
    <div class="min-w-0 flex-1">{@render children()}</div>
  </Sidebar.Inset>
</Sidebar.Provider>
