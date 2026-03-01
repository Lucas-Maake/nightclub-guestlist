<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
	import { cn } from '$lib/utils/cn';

	const TOAST_ENTER_MS = 180;
	const TOAST_EXIT_MS = 140;
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-4 z-[70] mx-auto flex max-w-xl flex-col gap-2 px-4">
	{#each $toasts as toast (toast.id)}
		<div
			class={cn(
				'pointer-events-auto rounded-2xl border px-4 py-3 shadow-lift backdrop-blur',
				toast.variant === 'success' && 'border-success/30 bg-success/16 text-success-foreground',
				toast.variant === 'destructive' && 'border-destructive/35 bg-destructive/16 text-destructive-foreground',
				(!toast.variant || toast.variant === 'default') && 'border-border bg-card/95 text-card-foreground'
			)}
			in:fly={{ y: 10, opacity: 0, duration: TOAST_ENTER_MS }}
			out:fly={{ y: 6, opacity: 0, duration: TOAST_EXIT_MS }}
		>
			<div class="flex items-start justify-between gap-3">
				<div class="space-y-1">
					<p class="text-sm font-medium">{toast.title}</p>
					{#if toast.description}
						<p class="text-xs text-muted-foreground">{toast.description}</p>
					{/if}
					{#if toast.action}
						<button
							class="mt-1 text-xs font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
							onclick={() => {
								toast.action?.onClick();
								dismissToast(toast.id);
							}}
						>
							{toast.action.label}
						</button>
					{/if}
				</div>
				<button
					class="inline-flex h-7 w-7 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
					onclick={() => dismissToast(toast.id)}
					aria-label="Dismiss toast"
				>
					×
				</button>
			</div>
		</div>
	{/each}
</div>
