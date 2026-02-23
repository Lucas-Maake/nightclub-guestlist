<script lang="ts">
	import { Progress } from '$lib/components/ui/progress';

	export let capacity: number;
	export let accepted: number;
	export let declined = 0;

	$: safeCapacity = Math.max(1, capacity);
	$: acceptedSafe = Math.max(0, accepted);
	$: spotsLeft = Math.max(0, safeCapacity - acceptedSafe);
</script>

<div class="space-y-3 rounded-2xl border border-border/80 bg-secondary/30 p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-sm font-medium text-foreground">Capacity</p>
		<p class="text-sm text-muted-foreground">{acceptedSafe}/{safeCapacity} spots claimed</p>
	</div>
	<Progress value={acceptedSafe} max={safeCapacity} />
	<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
		<p>{spotsLeft} spots left</p>
		<p>{declined} declined</p>
	</div>
</div>
