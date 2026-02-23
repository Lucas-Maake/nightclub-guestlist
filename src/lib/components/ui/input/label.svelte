<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let className = '';
	export { className as class };
</script>

<label class={cn('text-sm font-medium text-foreground/95', className)} {...$$restProps}>
	<slot />
</label>
