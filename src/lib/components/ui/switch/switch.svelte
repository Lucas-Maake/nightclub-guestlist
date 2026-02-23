<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLAttributes<HTMLButtonElement> & {
		checked?: boolean;
		disabled?: boolean;
	};

	const dispatch = createEventDispatcher<{ toggle: boolean }>();

	let { class: className = '', checked = false, disabled = false, ...rest }: Props = $props();

	function toggle(): void {
		if (disabled) {
			return;
		}

		checked = !checked;
		dispatch('toggle', checked);
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-disabled={disabled}
	class={cn(
		'relative inline-flex h-7 w-12 items-center rounded-pill border border-border bg-secondary/70 p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
		checked ? 'bg-primary/55' : '',
		className
	)}
	onclick={toggle}
	{...rest}
>
	<span
		class={cn(
			'block h-5 w-5 rounded-pill bg-card shadow-sm transition-transform',
			checked ? 'translate-x-5' : 'translate-x-0'
		)}
	></span>
</button>
