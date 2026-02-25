<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { authReady, currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listHostReservations } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { HostReservationListItem } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';
import { formatReservationDate } from '$lib/utils/format';

	let reservations = $state<HostReservationListItem[]>([]);
	let loading = $state(true);
	let loadError = $state('');

	function reservationDateLine(value: HostReservationListItem): string {
		return formatReservationDate(value.startAt.toDate());
	}

	function responseSummary(value: HostReservationListItem): string {
		return `${value.acceptedCount} accepted - ${value.declinedCount} declined`;
	}

	function loadErrorMessage(error: unknown): string {
		const code =
			error && typeof error === 'object' && 'code' in error ? String(error.code ?? '') : '';
		if (code === 'permission-denied') {
			return 'Unable to load your host events. Firestore rules may need to be deployed.';
		}
		return 'Unable to load your host events right now.';
	}

	async function loadHostEvents(uid: string): Promise<void> {
		loading = true;
		loadError = '';
		try {
			reservations = await listHostReservations(uid);
		} catch (error) {
			console.error('Failed to load host events', error);
			reservations = [];
			loadError = loadErrorMessage(error);
		} finally {
			loading = false;
		}
	}

	async function handleSignIn(): Promise<void> {
		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		await openAuthModal({ returnTo, source: 'host-events' });
	}

	onMount(async () => {
		await waitForAuthReady();
	});

	$effect(() => {
		if (!$authReady) {
			return;
		}

		const uid = $currentUser?.uid ?? '';
		if (!uid) {
			reservations = [];
			loadError = '';
			loading = false;
			return;
		}

		void loadHostEvents(uid);
	});

	const upcomingReservations = $derived.by(() =>
		reservations
			.filter((item) => item.startAt.toMillis() >= Date.now())
			.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
	);
	const pastReservations = $derived.by(() =>
		reservations
			.filter((item) => item.startAt.toMillis() < Date.now())
			.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())
	);
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-10">
	<section class="mx-auto w-full max-w-4xl space-y-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="space-y-1">
				<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Host Flow</p>
				<h1 class="section-title">My Events</h1>
				<p class="section-lead">Get back to host tools quickly after signing in.</p>
			</div>
			<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href="/create">Create event</a>
		</div>

		{#if loading}
			<Card>
				<CardContent class="p-6">
					<p class="state-panel-muted" aria-live="polite">Loading your host events...</p>
				</CardContent>
			</Card>
		{:else if !$currentUser}
			<Card>
				<CardHeader>
					<CardTitle>Sign in required</CardTitle>
					<CardDescription>Sign in to view the events you host.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button size="sm" onclick={handleSignIn}>Sign in</Button>
				</CardContent>
			</Card>
		{:else if loadError}
			<Card>
				<CardContent class="p-6">
					<p class="state-panel-error" aria-live="polite">{loadError}</p>
					<Button class="mt-4" size="sm" variant="outline" onclick={() => loadHostEvents($currentUser.uid)}>
						Try again
					</Button>
				</CardContent>
			</Card>
		{:else if reservations.length === 0}
			<Card>
				<CardContent class="p-6">
					<div class="state-panel-muted">
						<p class="font-medium text-foreground">No hosted events yet.</p>
						<p class="mt-1 text-sm">Create your first event to start managing guests and check-in.</p>
						<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')} href="/create">
							Create event
						</a>
					</div>
				</CardContent>
			</Card>
		{:else}
			<div class="space-y-6">
				<div class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-lg font-semibold">Upcoming</h2>
						<p class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
							{upcomingReservations.length} event{upcomingReservations.length === 1 ? '' : 's'}
						</p>
					</div>

					{#if upcomingReservations.length === 0}
						<p class="state-panel-muted">No upcoming hosted events.</p>
					{:else}
						<div class="space-y-3">
							{#each upcomingReservations as reservation (reservation.reservationId)}
								<div class="rounded-2xl border border-border/75 bg-card/45 p-4 sm:p-5">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="space-y-1">
											<p class="text-base font-semibold text-foreground">{reservation.clubName}</p>
											<p class="text-sm text-primary">{reservationDateLine(reservation)}</p>
											<p class="text-xs text-muted-foreground">
												{reservation.tableType} - Capacity {reservation.capacity}
											</p>
										</div>
										<p class="text-xs uppercase tracking-[0.15em] text-muted-foreground">
											{responseSummary(reservation)}
										</p>
									</div>

									{#if reservation.notes}
										<p class="mt-3 text-sm text-muted-foreground">{reservation.notes}</p>
									{/if}

									<div class="mt-4 flex flex-wrap gap-2">
										<a class={cn(buttonVariants({ variant: 'default', size: 'sm' }))} href={`/r/${reservation.reservationId}/host`}>
											Host hub
										</a>
										<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/r/${reservation.reservationId}/checkin`}>
											Check-in
										</a>
										<a class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))} href={`/r/${reservation.reservationId}`}>
											Guest page
										</a>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-lg font-semibold">Past</h2>
						<p class="text-xs uppercase tracking-[0.16em] text-muted-foreground">
							{pastReservations.length} event{pastReservations.length === 1 ? '' : 's'}
						</p>
					</div>

					{#if pastReservations.length === 0}
						<p class="state-panel-muted">No past hosted events.</p>
					{:else}
						<div class="space-y-3">
							{#each pastReservations as reservation (reservation.reservationId)}
								<div class="rounded-2xl border border-border/70 bg-secondary/20 p-4 sm:p-5">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="space-y-1">
											<p class="text-base font-semibold text-foreground">{reservation.clubName}</p>
											<p class="text-sm text-muted-foreground">{reservationDateLine(reservation)}</p>
											<p class="text-xs text-muted-foreground">
												{reservation.tableType} - Capacity {reservation.capacity}
											</p>
										</div>
										<p class="text-xs uppercase tracking-[0.15em] text-muted-foreground">
											{responseSummary(reservation)}
										</p>
									</div>

									<div class="mt-4 flex flex-wrap gap-2">
										<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/r/${reservation.reservationId}/host`}>
											Host hub
										</a>
										<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/r/${reservation.reservationId}/checkin`}>
											Check-in
										</a>
										<a class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))} href={`/r/${reservation.reservationId}`}>
											Guest page
										</a>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</section>
</main>
