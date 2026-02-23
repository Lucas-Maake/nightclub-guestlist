<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLThAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLThAttributes & {
		children?: Snippet;
	};
	let { class: className = '', children, ...rest }: Props = $props();
</script>

<th class={cn('h-11 px-4 text-left text-xs font-medium uppercase tracking-wide', className)} {...rest}>
	{@render children?.()}
</th>
