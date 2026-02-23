<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { buttonVariants, type ButtonVariants } from './button-variants';

	let className = '';
	export { className as class };

	export let variant: ButtonVariants['variant'] = 'default';
	export let size: ButtonVariants['size'] = 'md';
	export let type: 'button' | 'submit' | 'reset' = 'button';
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {type} {...$$restProps}>
	<slot />
</button>
