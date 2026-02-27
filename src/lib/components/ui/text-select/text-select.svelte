<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import { cn } from '$lib/utils/cn';

	type Props = {
		id?: string;
		value?: string;
		options?: string[];
		placeholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		class?: string;
	};

	const dispatch = createEventDispatcher<{ change: { value: string } }>();

	let {
		id = undefined,
		value = '',
		options = [],
		placeholder = 'Select an option',
		ariaLabel = 'Select option',
		disabled = false,
		class: className = ''
	}: Props = $props();

	let open = $state(false);
	let rootElement = $state<HTMLDivElement | null>(null);

	const normalizedOptions = $derived(
		options
			.map((option) => option.trim())
			.filter(Boolean)
			.filter((option, index, source) => source.indexOf(option) === index)
	);
	const hasSelection = $derived(value.trim().length > 0);

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

	function selectValue(nextValue: string): void {
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

<div bind:this={rootElement} class={cn('relative', className)}>
	<button
		type="button"
		{id}
		class="inline-flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-input bg-background/40 px-4 text-left text-sm outline-none transition-all focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={ariaLabel}
		{disabled}
		onclick={toggleMenu}
	>
		<span class={cn('truncate', hasSelection ? 'text-foreground' : 'text-muted-foreground')}>
			{hasSelection ? value : placeholder}
		</span>
		<ChevronDown
			class={cn(
				'h-4 w-4 text-muted-foreground transition-transform',
				open && 'rotate-180 text-foreground'
			)}
			aria-hidden="true"
		/>
	</button>

	{#if open}
		<div class="absolute top-[calc(100%+0.35rem)] z-40 w-full overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-[0_22px_60px_-30px_rgba(0,0,0,0.95)] backdrop-blur">
			<ul class="max-h-56 overflow-y-auto p-1" role="listbox" aria-label={ariaLabel}>
				{#each normalizedOptions as option}
					<li role="option" aria-selected={option === value}>
						<button
							type="button"
							class={cn(
								'w-full rounded-lg px-3 py-2 text-left text-sm transition',
								option === value
									? 'bg-primary/22 text-primary-foreground'
									: 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
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
