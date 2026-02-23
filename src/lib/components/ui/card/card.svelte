<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
	};

	let { class: className = '', children, ...rest }: Props = $props();
</script>

<div
	class={cn(
		'rounded-3xl border border-border/80 bg-card/80 text-card-foreground shadow-surface backdrop-blur-sm',
		className
	)}
	{...rest}
>
	{@render children?.()}
</div>
