<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';

	type Props = {
		open?: boolean;
		class?: string;
		closeOnBackdrop?: boolean;
		children?: Snippet;
	};

	const dispatch = createEventDispatcher<{ openChange: boolean }>();

	let { open = false, class: className = '', closeOnBackdrop = true, children }: Props = $props();
	let openSnapshot = $state(false);

	function closeDialog(): void {
		open = false;
		dispatch('openChange', false);
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!open) {
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			closeDialog();
		}
	}

	$effect(() => {
		const isOpen = open;

		if (isOpen && !openSnapshot) {
			lockBodyScroll();
		}

		if (!isOpen && openSnapshot) {
			unlockBodyScroll();
		}

		openSnapshot = isOpen;
	});

	onDestroy(() => {
		if (openSnapshot) {
			unlockBodyScroll();
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/72 backdrop-blur-sm disabled:pointer-events-none"
		aria-label="Close dialog"
		disabled={!closeOnBackdrop}
		onclick={() => closeOnBackdrop && closeDialog()}
	></button>
	<div class="pointer-events-none fixed inset-0 z-50 grid place-items-center px-4 py-8">
		<div
			class={cn(
				'pointer-events-auto w-full max-w-xl max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-lift sm:p-7',
				className
			)}
			role="dialog"
			aria-modal="true"
		>
			{@render children?.()}
		</div>
	</div>
{/if}
