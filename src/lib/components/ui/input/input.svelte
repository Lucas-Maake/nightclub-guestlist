<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let className = '';
	export { className as class };

	export let value: string | number | null | undefined = '';
</script>

<input
	class={cn(
		'h-11 w-full rounded-2xl border border-primary/15 bg-background/30 px-4 text-sm text-foreground backdrop-blur-sm',
		'placeholder:text-muted-foreground/70',
		'shadow-[inset_0_1px_2px_hsl(var(--background)/0.3)]',
		'outline-none transition-all duration-200',
		'focus:border-primary/50 focus:bg-background/40',
		'focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.15),inset_0_1px_2px_hsl(var(--background)/0.2)]',
		'disabled:cursor-not-allowed disabled:opacity-60',
		className
	)}
	bind:value
	{...$$restProps}
/>
