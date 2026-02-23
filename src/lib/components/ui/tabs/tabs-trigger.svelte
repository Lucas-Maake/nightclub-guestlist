<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLButtonAttributes & {
		active?: boolean;
		children?: Snippet;
	};

	let { class: className = '', active = false, children, ...rest }: Props = $props();
</script>

<button
	class={cn(
		'inline-flex h-9 items-center rounded-pill px-4 text-sm font-medium text-muted-foreground transition-colors',
		active ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground',
		className
	)}
	{...rest}
>
	{@render children?.()}
</button>
