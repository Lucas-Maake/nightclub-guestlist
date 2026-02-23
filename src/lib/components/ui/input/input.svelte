<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let className = '';
	export { className as class };

	export let value: string | number | null | undefined = '';
</script>

<input
	class={cn(
		'h-11 w-full rounded-2xl border border-input bg-background/40 px-4 text-sm text-foreground placeholder:text-muted-foreground/80 outline-none transition-all focus:border-primary/60 focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60',
		className
	)}
	bind:value
	{...$$restProps}
/>
