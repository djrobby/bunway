<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = "default",
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		"shrink-0 overflow-hidden rounded-full border border-transparent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-5 data-[size=sm]:w-9 data-checked:bg-primary data-[state=checked]:bg-primary data-unchecked:bg-input data-[state=unchecked]:bg-input peer group/switch relative inline-flex items-center transition-colors duration-200 outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="pointer-events-none absolute left-px block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 group-data-[size=sm]/switch:size-4 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
	/>
</SwitchPrimitive.Root>

<style>
	:global([data-slot="switch"][data-checked] [data-slot="switch-thumb"]),
	:global([data-slot="switch"][data-state="checked"] [data-slot="switch-thumb"]) { transform: translateX(1.25rem); }
	:global([data-slot="switch"][data-size="sm"][data-checked] [data-slot="switch-thumb"]),
	:global([data-slot="switch"][data-size="sm"][data-state="checked"] [data-slot="switch-thumb"]) { transform: translateX(1rem); }
	:global([data-slot="switch"][data-unchecked] [data-slot="switch-thumb"]),
	:global([data-slot="switch"][data-state="unchecked"] [data-slot="switch-thumb"]) { transform: translateX(0); }
</style>
