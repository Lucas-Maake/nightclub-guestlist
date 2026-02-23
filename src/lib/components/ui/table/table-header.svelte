<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableSectionElement> & {
		children?: Snippet;
	};
	let { children, ...rest }: Props = $props();
</script>

<thead class="bg-secondary/45 text-muted-foreground" {...rest}>
	{@render children?.()}
</thead>
