<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTdAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLTdAttributes & {
		children?: Snippet;
	};
	let { class: className = '', children, ...rest }: Props = $props();
</script>

<td class={cn('px-4 py-3 align-middle text-foreground', className)} {...rest}>
	{@render children?.()}
</td>
