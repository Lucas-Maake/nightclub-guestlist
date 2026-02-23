<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let className = '';
	export { className as class };

	export let value = 0;
	export let max = 100;

	$: safeMax = max <= 0 ? 100 : max;
	$: percent = Math.max(0, Math.min(100, (value / safeMax) * 100));
</script>

<div class={cn('h-2.5 w-full overflow-hidden rounded-pill bg-secondary/70', className)} {...$$restProps}>
	<div class="h-full rounded-pill bg-primary transition-[width] duration-300 ease-out" style:width={`${percent}%`}>
	</div>
</div>
