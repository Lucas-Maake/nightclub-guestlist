<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { ChevronDown } from 'lucide-svelte';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLAttributes<HTMLDivElement> & {
		value?: number;
		options?: number[];
		ariaLabel?: string;
		disabled?: boolean;
		menuAlign?: 'left' | 'right';
	};

	const dispatch = createEventDispatcher<{ change: { value: number } }>();

	let {
		class: className = '',
		value = 0,
		options = [],
		ariaLabel = 'Select quantity',
		disabled = false,
		menuAlign = 'right',
		...rest
	}: Props = $props();

	let open = $state(false);
	let rootElement = $state<HTMLDivElement | null>(null);

	const normalizedOptions = $derived(options.length > 0 ? options : [0]);
	const selectedValue = $derived(
		normalizedOptions.includes(value) ? value : (normalizedOptions[0] ?? 0)
	);

	$effect(() => {
		if (disabled) {
			open = false;
		}
	});

	function toggleMenu(): void {
		if (disabled) {
			return;
		}
		open = !open;
	}

	function selectValue(nextValue: number): void {
		value = nextValue;
		open = false;
		dispatch('change', { value: nextValue });
	}

	onMount(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}
			if (!rootElement?.contains(target)) {
				open = false;
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				open = false;
			}
		};

		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleEscape);

		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleEscape);
		};
	});
</script>

<div bind:this={rootElement} class={cn('relative', className)} {...rest}>
	<button
		type="button"
		class="inline-flex h-9 min-w-[72px] items-center justify-between gap-2 rounded-lg border border-border bg-background/30 px-3 text-sm font-medium text-foreground transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={ariaLabel}
		{disabled}
		onclick={toggleMenu}
	>
		<span>{selectedValue}</span>
		<ChevronDown
			class={cn(
				'h-3.5 w-3.5 text-muted-foreground transition-transform',
				open && 'rotate-180 text-foreground'
			)}
			aria-hidden="true"
		/>
	</button>

	{#if open}
		<div
			class={cn(
				'absolute top-[calc(100%+0.35rem)] z-30 min-w-[72px] overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_42px_-22px_rgba(0,0,0,0.9)] backdrop-blur',
				menuAlign === 'left' ? 'left-0' : 'right-0'
			)}
		>
			<ul class="max-h-48 overflow-y-auto py-1" role="listbox" aria-label={ariaLabel}>
				{#each normalizedOptions as option}
					<li role="option" aria-selected={option === selectedValue}>
						<button
							type="button"
							class={cn(
								'block w-full px-3 py-1.5 text-left text-sm transition hover:bg-secondary/70',
								option === selectedValue
									? 'bg-secondary/65 font-medium text-foreground'
									: 'text-muted-foreground'
							)}
							onclick={() => selectValue(option)}
						>
							{option}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
