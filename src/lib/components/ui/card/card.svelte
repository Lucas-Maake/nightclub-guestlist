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
		'motion-surface rounded-3xl border border-primary/10 bg-card/65 text-card-foreground backdrop-blur-md transition-all duration-300',
		'shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.04),var(--shadow-surface)]',
		'hover:border-primary/20',
		className
	)}
	{...rest}
>
	{@render children?.()}
</div>
