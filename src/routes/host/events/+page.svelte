<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { authReady, currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listHostReservations } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import type { HostReservationListItem } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';
	import { formatReservationDate } from '$lib/utils/format';
	import { inviteUrl } from '$lib/utils/links';

	type HostEventStatus = 'upcoming' | 'live' | 'past';

	const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

	let reservations = $state<HostReservationListItem[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let search = $state('');
	let copyingReservationId = $state<string | null>(null);
	let copiedReservationId = $state<string | null>(null);

	function copyButtonText(reservationId: string): string {
		if (copyingReservationId === reservationId) return 'Copying...';
		if (copiedReservationId === reservationId) return 'Copied!';
		return 'Copy invite';
	}

	function reservationDateLine(value: HostReservationListItem): string {
		return formatReservationDate(value.startAt.toDate());
	}

	function responseSummary(value: HostReservationListItem): string {
		return `${value.acceptedCount} accepted - ${value.declinedCount} declined`;
	}

	function reservationStatus(value: HostReservationListItem): HostEventStatus {
		const startAt = value.startAt.toMillis();
		const now = Date.now();
		if (startAt > now) {
			return 'upcoming';
		}

		if (now - startAt <= LIVE_WINDOW_MS) {
			return 'live';
		}

		return 'past';
	}

	function statusLabel(status: HostEventStatus): string {
		if (status === 'live') {
			return 'Live';
		}

		if (status === 'upcoming') {
			return 'Upcoming';
		}

		return 'Past';
	}

	function statusVariant(status: HostEventStatus): 'default' | 'success' | 'outline' {
		if (status === 'live') {
			return 'success';
		}

		if (status === 'past') {
			return 'outline';
		}

		return 'default';
	}

	function loadErrorMessage(error: unknown): string {
		const code =
			error && typeof error === 'object' && 'code' in error ? String(error.code ?? '') : '';
		if (code === 'permission-denied') {
			return 'You do not have access to view this host page right now.';
		}
		return 'Unable to load your host events right now.';
	}

	function reservationMatchesSearch(value: HostReservationListItem, query: string): boolean {
		if (!query) {
			return true;
		}

		const haystack = [
			value.clubName,
			value.tableType,
			value.notes,
			reservationDateLine(value),
			String(value.capacity)
		]
			.join(' ')
			.toLowerCase();

		return haystack.includes(query);
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

	async function copyInvite(reservationId: string): Promise<void> {
		if (copyingReservationId) {
			return;
		}

		copyingReservationId = reservationId;
		copiedReservationId = null;
		try {
			if (!navigator.clipboard?.writeText) {
				throw new Error('Clipboard unavailable');
			}

			const url = inviteUrl(reservationId);
			await navigator.clipboard.writeText(url);
			copiedReservationId = reservationId;
			pushToast({
				title: 'Invite copied',
				description: url,
				variant: 'success'
			});
			setTimeout(() => {
				if (copiedReservationId === reservationId) {
					copiedReservationId = null;
				}
			}, 2000);
		} catch {
			pushToast({
				title: 'Copy failed',
				description: 'Could not copy invite link. Try again.',
				variant: 'destructive'
			});
		} finally {
			copyingReservationId = null;
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

	const normalizedSearch = $derived(search.trim().toLowerCase());
	const filteredReservations = $derived.by(() =>
		reservations.filter((reservation) => reservationMatchesSearch(reservation, normalizedSearch))
	);
	const upcomingReservations = $derived.by(() =>
		filteredReservations
			.filter((item) => reservationStatus(item) === 'upcoming')
			.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
	);
	const liveReservations = $derived.by(() =>
		filteredReservations
			.filter((item) => reservationStatus(item) === 'live')
			.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())
	);
	const pastReservations = $derived.by(() =>
		filteredReservations
			.filter((item) => reservationStatus(item) === 'past')
			.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())
	);
	const filteredCountLabel = $derived(
		`${filteredReservations.length} event${filteredReservations.length === 1 ? '' : 's'} shown`
	);
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-10">
	<section class="mx-auto w-full max-w-5xl space-y-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="space-y-1">
				<h1 class="section-title">My Events</h1>
			</div>
		</div>

		{#if loading}
			<div class="space-y-4" aria-live="polite" aria-busy="true">
				{#each [1, 2] as _}
					<Card class="animate-pulse">
						<CardHeader class="space-y-2">
							<div class="flex items-center gap-2">
								<div class="h-5 w-16 rounded-full bg-secondary/50"></div>
							</div>
							<div class="h-6 w-2/3 rounded bg-secondary/60"></div>
							<div class="h-4 w-1/3 rounded bg-secondary/50"></div>
						</CardHeader>
						<CardContent class="space-y-3">
							<div class="h-4 w-1/2 rounded bg-secondary/50"></div>
							<div class="flex gap-2">
								<div class="h-9 w-24 rounded-lg bg-secondary/40"></div>
								<div class="h-9 w-24 rounded-lg bg-secondary/40"></div>
								<div class="h-9 w-24 rounded-lg bg-secondary/40"></div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
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
						<p class="mt-1 text-sm">
							Open an event card and book a table to create your first hosted event.
						</p>
						<div class="mt-4 flex flex-wrap gap-2">
							<a class={cn(buttonVariants({ size: 'sm' }))} href="/event">Browse events</a>
						</div>
					</div>
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardContent class="space-y-4 p-4 sm:p-5">
					<Input
						type="search"
						placeholder="Search by venue, table type, notes, date..."
						bind:value={search}
						class="h-12 text-base"
					/>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="success">Live {liveReservations.length}</Badge>
						<Badge>Upcoming {upcomingReservations.length}</Badge>
						<Badge variant="outline">Past {pastReservations.length}</Badge>
					</div>
					<p class="text-xs uppercase tracking-[0.15em] text-muted-foreground">{filteredCountLabel}</p>
				</CardContent>
			</Card>

			{#if filteredReservations.length === 0}
				<Card>
					<CardContent class="p-6">
						<div class="state-panel-muted">
							<p class="font-medium text-foreground">No matching events.</p>
							<p class="mt-1 text-sm">Try a different search term.</p>
						</div>
					</CardContent>
				</Card>
			{:else}
				<div class="space-y-6">
					{#if liveReservations.length > 0}
						<section class="space-y-3">
							<div class="flex items-center justify-between gap-3">
								<h2 class="text-lg font-semibold">Live</h2>
								<Badge variant="success">{liveReservations.length}</Badge>
							</div>
							<div class="space-y-3">
								{#each liveReservations as reservation (reservation.reservationId)}
									<article class="rounded-2xl border border-success/35 bg-success/10 p-4 sm:p-5">
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="space-y-1">
												<p class="text-base font-semibold text-foreground">{reservation.clubName}</p>
												<p class="text-sm text-primary">{reservationDateLine(reservation)}</p>
												<p class="text-xs text-muted-foreground">
													{reservation.tableType} - Capacity {reservation.capacity}
												</p>
											</div>
											<Badge variant={statusVariant(reservationStatus(reservation))}>
												{statusLabel(reservationStatus(reservation))}
											</Badge>
										</div>

										<p class="mt-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">
											{responseSummary(reservation)}
										</p>

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
											<Button
												size="sm"
												variant="ghost"
												disabled={copyingReservationId === reservation.reservationId}
												onclick={() => copyInvite(reservation.reservationId)}
											>
												{copyButtonText(reservation.reservationId)}
											</Button>
										</div>
									</article>
								{/each}
							</div>
						</section>
					{/if}

					{#if upcomingReservations.length > 0}
						<section class="space-y-3">
							<div class="flex items-center justify-between gap-3">
								<h2 class="text-lg font-semibold">Upcoming</h2>
								<Badge>{upcomingReservations.length}</Badge>
							</div>
							<div class="space-y-3">
								{#each upcomingReservations as reservation (reservation.reservationId)}
									<article class="rounded-2xl border border-border/75 bg-card/45 p-4 sm:p-5">
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="space-y-1">
												<p class="text-base font-semibold text-foreground">{reservation.clubName}</p>
												<p class="text-sm text-primary">{reservationDateLine(reservation)}</p>
												<p class="text-xs text-muted-foreground">
													{reservation.tableType} - Capacity {reservation.capacity}
												</p>
											</div>
											<Badge variant={statusVariant(reservationStatus(reservation))}>
												{statusLabel(reservationStatus(reservation))}
											</Badge>
										</div>

										<p class="mt-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">
											{responseSummary(reservation)}
										</p>

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
											<Button
												size="sm"
												variant="ghost"
												disabled={copyingReservationId === reservation.reservationId}
												onclick={() => copyInvite(reservation.reservationId)}
											>
												{copyButtonText(reservation.reservationId)}
											</Button>
										</div>
									</article>
								{/each}
							</div>
						</section>
					{/if}

					{#if pastReservations.length > 0}
						<section class="space-y-3">
							<div class="flex items-center justify-between gap-3">
								<h2 class="text-lg font-semibold">Past</h2>
								<Badge variant="outline">{pastReservations.length}</Badge>
							</div>
							<div class="space-y-3">
								{#each pastReservations as reservation (reservation.reservationId)}
									<article class="rounded-2xl border border-border/70 bg-secondary/20 p-4 sm:p-5">
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="space-y-1">
												<p class="text-base font-semibold text-foreground">{reservation.clubName}</p>
												<p class="text-sm text-muted-foreground">{reservationDateLine(reservation)}</p>
												<p class="text-xs text-muted-foreground">
													{reservation.tableType} - Capacity {reservation.capacity}
												</p>
											</div>
											<Badge variant={statusVariant(reservationStatus(reservation))}>
												{statusLabel(reservationStatus(reservation))}
											</Badge>
										</div>

										<p class="mt-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">
											{responseSummary(reservation)}
										</p>

										{#if reservation.notes}
											<p class="mt-3 text-sm text-muted-foreground">{reservation.notes}</p>
										{/if}

										<div class="mt-4 flex flex-wrap gap-2">
											<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/r/${reservation.reservationId}/host`}>
												Host hub
											</a>
											<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/r/${reservation.reservationId}/checkin`}>
												Check-in
											</a>
											<Button
												size="sm"
												variant="ghost"
												disabled={copyingReservationId === reservation.reservationId}
												onclick={() => copyInvite(reservation.reservationId)}
											>
												{copyButtonText(reservation.reservationId)}
											</Button>
										</div>
									</article>
								{/each}
							</div>
						</section>
					{/if}
				</div>
			{/if}
		{/if}
	</section>
</main>
