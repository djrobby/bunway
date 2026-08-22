<script lang="ts">
  import { onMount } from 'svelte'
  import RiCheckLine from 'remixicon-svelte/icons/check-line'
  import RiEqualizer2Line from 'remixicon-svelte/icons/equalizer-2-line'
  import RiExpandUpDownLine from 'remixicon-svelte/icons/expand-up-down-line'
  import RiShuffleLine from 'remixicon-svelte/icons/shuffle-line'
  import RiSunLine from 'remixicon-svelte/icons/sun-line'
  import RiMoonLine from 'remixicon-svelte/icons/moon-line'
  import RiComputerLine from 'remixicon-svelte/icons/computer-line'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import * as Sheet from '$lib/components/ui/sheet/index.js'

  type Theme = 'light' | 'dark' | 'system'
  const styles = ['Nova', 'Vega', 'Maia', 'Lyra', 'Mira', 'Luma', 'Sera', 'Rhea'] as const
  const baseColors = ['Neutral', 'Stone', 'Zinc', 'Gray', 'Slate'] as const
  const colors = ['Neutral', 'Red', 'Rose', 'Orange', 'Green', 'Blue', 'Yellow', 'Violet'] as const
  type Style = Lowercase<(typeof styles)[number]>
  let theme = $state<Theme>('system')
  let uiStyle = $state<Style>('nova')
  let baseColor = $state('neutral')
  let accentColor = $state('neutral')
  let chartColor = $state('neutral')
  let styleOpen = $state(false)

  function persist(name: string, value: string) { localStorage.setItem(name, value); document.documentElement.setAttribute(`data-${name}`, value) }
  function apply(next: Theme) {
    theme = next
    if (next === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark' || (next === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
  }
  function cycleTheme() { apply(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light') }
  function applyStyle(next: Style) { uiStyle = next; persist('ui-style', next); styleOpen = false }
  function applyBase(next: string | undefined) { if (next) { baseColor = next; persist('ui-base', next) } }
  function applyAccent(next: string | undefined) { if (next) { accentColor = next; persist('ui-accent', next) } }
  function applyChart(next: string | undefined) { if (next) { chartColor = next; persist('ui-chart', next) } }
  function shuffle() {
    applyStyle(styles[Math.floor(Math.random() * styles.length)]!.toLowerCase() as Style)
    applyBase(baseColors[Math.floor(Math.random() * baseColors.length)]!.toLowerCase())
    applyAccent(colors[Math.floor(Math.random() * colors.length)]!.toLowerCase())
    applyChart(colors[Math.floor(Math.random() * colors.length)]!.toLowerCase())
  }
  function reset() { applyStyle('nova'); applyBase('neutral'); applyAccent('neutral'); applyChart('neutral') }

  onMount(() => {
    const saved = localStorage.getItem('theme'); apply(saved === 'light' || saved === 'dark' ? saved : 'system')
    const savedStyle = localStorage.getItem('ui-style') as Style | null
    applyStyle(styles.some(value => value.toLowerCase() === savedStyle) ? savedStyle! : 'nova')
    applyBase(localStorage.getItem('ui-base') ?? 'neutral'); applyAccent(localStorage.getItem('ui-accent') ?? 'neutral'); applyChart(localStorage.getItem('ui-chart') ?? 'neutral')
    const media = matchMedia('(prefers-color-scheme: dark)'); const update = () => { if (theme === 'system') apply('system') }
    media.addEventListener('change', update); return () => media.removeEventListener('change', update)
  })
</script>

<div class="flex items-center gap-1">
  <Button variant="ghost" size="icon" onclick={cycleTheme} aria-label={`Color mode: ${theme}. Activate to cycle mode.`} title={`Color mode: ${theme}`}>
    {#if theme === 'light'}<RiSunLine />{:else if theme === 'dark'}<RiMoonLine />{:else}<RiComputerLine />{/if}
  </Button>
  <Sheet.Root>
    <Sheet.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label="Customize interface"><RiEqualizer2Line /></Button>{/snippet}</Sheet.Trigger>
    <Sheet.Content class="w-full overflow-y-auto sm:max-w-md"><Sheet.Header><Sheet.Title>Customize interface</Sheet.Title><Sheet.Description>Change the visual style without changing application code.</Sheet.Description></Sheet.Header>
      <div class="grid gap-6 px-4 py-6">
        <label class="grid gap-2"><span class="text-sm font-medium">Style</span><Popover.Root bind:open={styleOpen}><Popover.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" class="w-full justify-between font-normal">{styles.find(value => value.toLowerCase() === uiStyle)}<RiExpandUpDownLine class="size-4 opacity-50" /></Button>{/snippet}</Popover.Trigger><Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start"><Command.Root><Command.Input placeholder="Type to find a style…" /><Command.List><Command.Empty>No style found.</Command.Empty><Command.Group>{#each styles as style}<Command.Item value={style} onSelect={() => applyStyle(style.toLowerCase() as Style)}><RiCheckLine class="mr-2 size-4 {style.toLowerCase() === uiStyle ? 'opacity-100' : 'opacity-0'}" />{style}</Command.Item>{/each}</Command.Group></Command.List></Command.Root></Popover.Content></Popover.Root></label>
        <label class="grid gap-2"><span class="text-sm font-medium">Base color</span><Select.Root type="single" value={baseColor} onValueChange={applyBase}><Select.Trigger class="w-full">{baseColors.find(value => value.toLowerCase() === baseColor)}</Select.Trigger><Select.Content>{#each baseColors as color}<Select.Item value={color.toLowerCase()}>{color}</Select.Item>{/each}</Select.Content></Select.Root></label>
        <label class="grid gap-2"><span class="text-sm font-medium">Theme color</span><Select.Root type="single" value={accentColor} onValueChange={applyAccent}><Select.Trigger class="w-full">{colors.find(value => value.toLowerCase() === accentColor)}</Select.Trigger><Select.Content>{#each colors as color}<Select.Item value={color.toLowerCase()}>{color}</Select.Item>{/each}</Select.Content></Select.Root></label>
        <label class="grid gap-2"><span class="text-sm font-medium">Chart color</span><Select.Root type="single" value={chartColor} onValueChange={applyChart}><Select.Trigger class="w-full">{colors.find(value => value.toLowerCase() === chartColor)}</Select.Trigger><Select.Content>{#each colors as color}<Select.Item value={color.toLowerCase()}>{color}</Select.Item>{/each}</Select.Content></Select.Root></label>
        <div class="grid grid-cols-2 gap-2"><Button variant="outline" onclick={reset}>Reset</Button><Button variant="outline" onclick={shuffle}><RiShuffleLine />Shuffle</Button></div>
      </div>
    </Sheet.Content>
  </Sheet.Root>
</div>
