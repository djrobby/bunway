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
  import { dateTimePreferences, loadDateTimePreferences, resetDateTimePreferences, saveDateTimePreferences, timezones, type DateFormat, type TimeFormat } from '$lib/date-time.svelte.js'

  type Theme = 'light' | 'dark' | 'system'
  const styles = ['Nova', 'Vega', 'Maia', 'Lyra', 'Mira', 'Luma', 'Sera', 'Rhea'] as const
  const colors = ['Neutral', 'Red', 'Rose', 'Orange', 'Green', 'Blue', 'Yellow', 'Violet'] as const
  type Style = Lowercase<(typeof styles)[number]>
  let theme = $state<Theme>('system')
  let uiStyle = $state<Style>('nova')
  let accentColor = $state('neutral')
  let chartColor = $state('neutral')
  let styleOpen = $state(false)
  let timezone = $state('UTC')
  let dateFormat = $state<DateFormat>('month-day-year')
  let timeFormat = $state<TimeFormat>('12-hour')

  function persist(name: string, value: string) { localStorage.setItem(name, value); document.documentElement.setAttribute(`data-${name}`, value) }
  function apply(next: Theme) {
    theme = next
    if (next === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark' || (next === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
  }
  function cycleTheme() { apply(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light') }
  function applyStyle(next: Style) { uiStyle = next; persist('ui-style', next); styleOpen = false }
  function applyAccent(next: string | undefined) { if (next) { accentColor = next; persist('ui-accent', next) } }
  function applyChart(next: string | undefined) { if (next) { chartColor = next; persist('ui-chart', next) } }
  function shuffle() {
    applyStyle(styles[Math.floor(Math.random() * styles.length)]!.toLowerCase() as Style)
    applyAccent(colors[Math.floor(Math.random() * colors.length)]!.toLowerCase())
    applyChart(colors[Math.floor(Math.random() * colors.length)]!.toLowerCase())
  }
  function reset() { applyStyle('nova'); applyAccent('neutral'); applyChart('neutral') }
  function saveDateTime() { saveDateTimePreferences({ timezone, dateFormat, timeFormat }) }
  function resetDateTime() { resetDateTimePreferences(); timezone = dateTimePreferences.timezone; dateFormat = dateTimePreferences.dateFormat; timeFormat = dateTimePreferences.timeFormat }

  onMount(() => {
    const saved = localStorage.getItem('theme'); apply(saved === 'light' || saved === 'dark' ? saved : 'system')
    const savedStyle = localStorage.getItem('ui-style') as Style | null
    applyStyle(styles.some(value => value.toLowerCase() === savedStyle) ? savedStyle! : 'nova')
    localStorage.removeItem('ui-base'); document.documentElement.setAttribute('data-ui-base', 'neutral'); applyAccent(localStorage.getItem('ui-accent') ?? 'neutral'); applyChart(localStorage.getItem('ui-chart') ?? 'neutral')
    loadDateTimePreferences(); timezone = dateTimePreferences.timezone; dateFormat = dateTimePreferences.dateFormat; timeFormat = dateTimePreferences.timeFormat
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
        <fieldset class="grid gap-6 rounded-lg border p-4"><legend class="px-2 text-sm font-semibold">Styles</legend>
        <label class="grid gap-2"><span class="text-sm font-medium">Style</span><Popover.Root bind:open={styleOpen}><Popover.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" class="w-full justify-between font-normal">{styles.find(value => value.toLowerCase() === uiStyle)}<RiExpandUpDownLine class="size-4 opacity-50" /></Button>{/snippet}</Popover.Trigger><Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start"><Command.Root><Command.Input placeholder="Type to find a style…" /><Command.List><Command.Empty>No style found.</Command.Empty><Command.Group>{#each styles as style}<Command.Item value={style} onSelect={() => applyStyle(style.toLowerCase() as Style)}><RiCheckLine class="mr-2 size-4 {style.toLowerCase() === uiStyle ? 'opacity-100' : 'opacity-0'}" />{style}</Command.Item>{/each}</Command.Group></Command.List></Command.Root></Popover.Content></Popover.Root></label>
        <label class="grid gap-2"><span class="text-sm font-medium">Theme color</span><Select.Root type="single" value={accentColor} onValueChange={applyAccent}><Select.Trigger class="w-full">{colors.find(value => value.toLowerCase() === accentColor)}</Select.Trigger><Select.Content>{#each colors as color}<Select.Item value={color.toLowerCase()}>{color}</Select.Item>{/each}</Select.Content></Select.Root></label>
        <label class="grid gap-2"><span class="text-sm font-medium">Chart color</span><Select.Root type="single" value={chartColor} onValueChange={applyChart}><Select.Trigger class="w-full">{colors.find(value => value.toLowerCase() === chartColor)}</Select.Trigger><Select.Content>{#each colors as color}<Select.Item value={color.toLowerCase()}>{color}</Select.Item>{/each}</Select.Content></Select.Root></label>
        <div class="grid grid-cols-2 gap-2"><Button variant="outline" onclick={reset}>Reset</Button><Button variant="outline" onclick={shuffle}><RiShuffleLine />Shuffle</Button></div>
        </fieldset>
        <fieldset class="grid gap-4 rounded-lg border p-4"><legend class="px-2 text-sm font-semibold">Date and time</legend>
          <label class="grid gap-2"><span class="text-sm font-medium">Timezone</span><select class="h-9 w-full rounded-md border bg-background px-3 text-sm" bind:value={timezone}>{#each timezones as zone}<option value={zone}>{zone}</option>{/each}</select></label>
          <label class="grid gap-2"><span class="text-sm font-medium">Date format</span><Select.Root type="single" value={dateFormat} onValueChange={(value) => { if (value) dateFormat = value as DateFormat }}><Select.Trigger class="w-full">{{ 'month-day-year': 'MM/DD/YYYY', 'day-month-year': 'DD/MM/YYYY', 'year-month-day': 'YYYY-MM-DD', long: 'Month D, YYYY' }[dateFormat]}</Select.Trigger><Select.Content><Select.Item value="month-day-year">MM/DD/YYYY</Select.Item><Select.Item value="day-month-year">DD/MM/YYYY</Select.Item><Select.Item value="year-month-day">YYYY-MM-DD</Select.Item><Select.Item value="long">Month D, YYYY</Select.Item></Select.Content></Select.Root></label>
          <label class="grid gap-2"><span class="text-sm font-medium">Time format</span><Select.Root type="single" value={timeFormat} onValueChange={(value) => { if (value) timeFormat = value as TimeFormat }}><Select.Trigger class="w-full">{timeFormat === '12-hour' ? '12-hour' : '24-hour'}</Select.Trigger><Select.Content><Select.Item value="12-hour">12-hour</Select.Item><Select.Item value="24-hour">24-hour</Select.Item></Select.Content></Select.Root></label>
          <div class="grid grid-cols-2 gap-2"><Button variant="outline" onclick={resetDateTime}>Reset</Button><Button onclick={saveDateTime}>Save</Button></div>
        </fieldset>
      </div>
    </Sheet.Content>
  </Sheet.Root>
</div>
