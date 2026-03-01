<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cva, type VariantProps } from 'class-variance-authority';
	import { cn } from '$lib/utils/cn';

	const badgeVariants = cva(
		'inline-flex items-center rounded-pill border px-3 py-1 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200',
		{
			variants: {
				variant: {
					default: 'border-border/50 bg-secondary/40 text-secondary-foreground',
					success:
						'border-success/40 bg-success/20 text-success-foreground shadow-[0_0_12px_hsl(150_80%_45%/0.25)]',
					live: 'border-success/50 bg-success/25 text-success-foreground shadow-[0_0_15px_hsl(150_80%_45%/0.3)] animate-pulse',
					destructive: 'border-destructive/30 bg-destructive/20 text-destructive-foreground',
					outline: 'border-primary/20 bg-primary/5 text-muted-foreground'
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
