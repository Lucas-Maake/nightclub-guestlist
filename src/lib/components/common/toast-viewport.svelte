<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast';
	import { cn } from '$lib/utils/cn';
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
		>
			<div class="flex items-start justify-between gap-3">
				<div class="space-y-1">
					<p class="text-sm font-medium">{toast.title}</p>
					{#if toast.description}
						<p class="text-xs text-muted-foreground">{toast.description}</p>
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
