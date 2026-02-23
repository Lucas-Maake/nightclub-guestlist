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
		'inline-flex h-11 items-center gap-1 rounded-pill border border-border bg-secondary/50 p-1',
		className
	)}
	{...rest}
>
	{@render children?.()}
</div>
