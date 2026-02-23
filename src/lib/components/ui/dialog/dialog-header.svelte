<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
	};
	let { class: className = '', children, ...rest }: Props = $props();
</script>

<div class={cn('space-y-2', className)} {...rest}>
	{@render children?.()}
</div>
