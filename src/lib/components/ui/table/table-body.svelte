<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableSectionElement> & {
		children?: Snippet;
	};
	let { children, ...rest }: Props = $props();
</script>

<tbody class="divide-y divide-border/60" {...rest}>
	{@render children?.()}
</tbody>
