<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLTableAttributes & {
		children?: Snippet;
	};
	let { class: className = '', children, ...rest }: Props = $props();
</script>

<div class="w-full overflow-x-auto rounded-2xl border border-border/70">
	<table class={cn('w-full caption-bottom text-sm', className)} {...rest}>
		{@render children?.()}
	</table>
</div>
