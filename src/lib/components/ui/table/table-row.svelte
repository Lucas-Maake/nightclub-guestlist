<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLAttributes<HTMLTableRowElement> & {
		children?: Snippet;
	};
	let { class: className = '', children, ...rest }: Props = $props();
</script>

<tr class={cn('transition-colors hover:bg-accent/35', className)} {...rest}>
	{@render children?.()}
</tr>
