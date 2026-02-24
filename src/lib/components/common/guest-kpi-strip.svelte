<script lang="ts">
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Badge } from '$lib/components/ui/badge';

	type Props = {
		acceptedCount: number;
		declinedCount: number;
		noResponseCount: number;
		checkedInCount: number;
	};

	let { acceptedCount, declinedCount, noResponseCount, checkedInCount }: Props = $props();
</script>

<section class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
	<div class="rounded-2xl border border-border/70 bg-secondary/20 px-3 py-2">
		<div class="flex items-center justify-between gap-3">
			<StatusChip status="accepted" />
			<p class="text-lg font-semibold leading-none text-foreground">{acceptedCount}</p>
		</div>
	</div>

	<div class="rounded-2xl border border-border/70 bg-secondary/20 px-3 py-2">
		<div class="flex items-center justify-between gap-3">
			<StatusChip status="declined" />
			<p class="text-lg font-semibold leading-none text-foreground">{declinedCount}</p>
		</div>
	</div>

	<div class="rounded-2xl border border-border/70 bg-secondary/20 px-3 py-2">
		<div class="flex items-center justify-between gap-3">
			<Badge variant="outline">No Response</Badge>
			<p class="text-lg font-semibold leading-none text-foreground">{noResponseCount}</p>
		</div>
	</div>

	<div class="rounded-2xl border border-border/70 bg-secondary/20 px-3 py-2">
		<div class="flex items-center justify-between gap-3">
			<StatusChip status="checked-in" />
			<p class="text-lg font-semibold leading-none text-foreground">{checkedInCount}</p>
		</div>
	</div>
</section>
