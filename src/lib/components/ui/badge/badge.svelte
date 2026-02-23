<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cva, type VariantProps } from 'class-variance-authority';
	import { cn } from '$lib/utils/cn';

	const badgeVariants = cva(
		'inline-flex items-center rounded-pill border px-3 py-1 text-xs font-medium tracking-wide',
		{
			variants: {
				variant: {
					default: 'border-border bg-secondary/50 text-secondary-foreground',
					success: 'border-success/30 bg-success/15 text-success-foreground',
					destructive: 'border-destructive/30 bg-destructive/20 text-destructive-foreground',
					outline: 'border-border/80 bg-transparent text-muted-foreground'
				}
			},
			defaultVariants: {
				variant: 'default'
			}
		}
	);

	type Props = HTMLAttributes<HTMLDivElement> &
		VariantProps<typeof badgeVariants> & {
			children?: Snippet;
		};
	let { class: className = '', variant = 'default', children, ...rest }: Props = $props();
</script>

<div class={cn(badgeVariants({ variant }), className)} {...rest}>
	{@render children?.()}
</div>
