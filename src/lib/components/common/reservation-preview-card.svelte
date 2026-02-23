<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import type { ReservationPublicRecord } from '$lib/types/models';
	import { formatReservationDate } from '$lib/utils/format';

	export let reservation: ReservationPublicRecord;
	export let showBadge = true;

	$: startsAt =
		reservation.startAt && 'toDate' in reservation.startAt
			? formatReservationDate(reservation.startAt.toDate())
			: '';
</script>

<Card class="overflow-hidden">
	<CardContent class="space-y-6 p-6 sm:p-7">
		<div class="space-y-3">
			<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reservation Invite</p>
			<h1 class="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{reservation.clubName}</h1>
			<p class="text-sm text-muted-foreground sm:text-base">{reservation.notes}</p>
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			<div class="rounded-2xl border border-border/80 bg-secondary/35 p-4">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Starts</p>
				<p class="mt-2 text-sm font-medium">{startsAt}</p>
			</div>
			<div class="rounded-2xl border border-border/80 bg-secondary/35 p-4">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Table</p>
				<p class="mt-2 text-sm font-medium">{reservation.tableType}</p>
			</div>
			<div class="rounded-2xl border border-border/80 bg-secondary/35 p-4">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Capacity</p>
				<p class="mt-2 text-sm font-medium">{reservation.capacity} guests</p>
			</div>
		</div>

		{#if reservation.dressCode}
			<div class="rounded-2xl border border-border/80 bg-secondary/30 p-4">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Dress code</p>
				<p class="mt-1 text-sm">{reservation.dressCode}</p>
			</div>
		{/if}

		{#if showBadge}
			<div class="flex flex-wrap gap-2">
				<Badge>Premium Access</Badge>
				<Badge variant="outline">Mobile Ready</Badge>
			</div>
		{/if}
	</CardContent>
</Card>
