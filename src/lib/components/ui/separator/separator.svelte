<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLAttributes<HTMLHRElement>;
	let { class: className = '', ...rest }: Props = $props();
</script>

<hr class={cn('border-border/70', className)} {...rest} />
