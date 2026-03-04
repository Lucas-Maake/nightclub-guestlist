<script lang="ts">
	import { page } from '$app/stores';
	import { Search } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { authReady, currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listHostReservations } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import type { HostReservationListItem } from '$lib/types/models';
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

	function statusBadgeClass(status: HostEventStatus): string {
		if (status === 'live') {
			return 'border-cyan-500/35 bg-cyan-500/15 text-cyan-300';
		}

		if (status === 'upcoming') {
			return 'border-violet-500/35 bg-violet-500/15 text-violet-300';
		}

		return 'border-zinc-700 bg-[#1A1A22] text-zinc-400';
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

<div class="min-h-screen bg-[#050507] text-white">
	<AppHeader />

	<main class="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 lg:px-20">
		<section class="space-y-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<h1 class="font-display text-[28px] font-extrabold uppercase tracking-[0.05em] text-white">
					MY EVENTS
				</h1>
				<a
					href="/event"
					class="font-display inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.35)]"
				>
					Browse events
				</a>
			</div>

			{#if loading}
				<div class="space-y-4" aria-live="polite" aria-busy="true">
					{#each [1, 2, 3] as placeholder (placeholder)}
						<div class="h-[170px] animate-pulse rounded-2xl border border-zinc-800 bg-[#14141A]"></div>
					{/each}
				</div>
			{:else if !$currentUser}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
					<p class="font-display text-xl font-semibold text-white">Sign in required</p>
					<p class="mt-2 text-sm text-zinc-400">Sign in to view the events you host.</p>
					<button
						type="button"
						class="font-display mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-5 text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.35)]"
						onclick={handleSignIn}
					>
						Sign in
					</button>
				</div>
			{:else if loadError}
				<div class="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-6">
					<p class="text-sm text-rose-100" aria-live="polite">{loadError}</p>
					<button
						type="button"
						class="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/90 px-5 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white"
						onclick={() => {
							if ($currentUser) {
								void loadHostEvents($currentUser.uid);
							}
						}}
					>
						Try again
					</button>
				</div>
			{:else if reservations.length === 0}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
					<p class="font-display text-xl font-semibold text-white">No hosted events yet</p>
					<p class="mt-2 text-sm text-zinc-400">
						Open an event card and book a table to create your first hosted event.
					</p>
					<a
						href="/event"
						class="font-display mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-5 text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.35)]"
					>
						Browse events
					</a>
				</div>
			{:else}
				<section class="space-y-6">
					<div class="overflow-hidden rounded-2xl border border-zinc-800 bg-[#14141A]">
						<div class="px-5 py-4 sm:px-6">
							<div class="flex items-center gap-2 text-zinc-500">
								<Search class="h-4 w-4" />
								<input
									type="search"
									placeholder="Search by venue, table type, notes, date..."
									bind:value={search}
									class="h-7 w-full border-none bg-transparent p-0 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
								/>
							</div>
						</div>
						<div class="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-5 py-3 sm:px-6">
							<span class="font-mono inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
								<span class="h-1.5 w-1.5 rounded-full bg-cyan-300"></span>
								Live {liveReservations.length}
							</span>
							<span class="font-mono inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300">
								<span class="h-1.5 w-1.5 rounded-full bg-violet-300"></span>
								Upcoming {upcomingReservations.length}
							</span>
							<span class="font-mono inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-[#1A1A22] px-3 py-1 text-xs font-semibold text-zinc-400">
								Past {pastReservations.length}
							</span>
						</div>
						<div class="border-t border-zinc-800 px-5 py-3 sm:px-6">
							<p class="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
								{filteredCountLabel}
							</p>
						</div>
					</div>

					{#if filteredReservations.length === 0}
						<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6 text-sm text-zinc-400">
							No events match this search.
						</div>
					{:else}
						<div class="space-y-8">
							{#if upcomingReservations.length > 0}
								<section class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<h2 class="font-display text-2xl font-bold text-white">Upcoming</h2>
										<span class="font-mono inline-flex items-center rounded-full border border-violet-500/35 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300">
											{upcomingReservations.length}
										</span>
									</div>
									<div class="space-y-4">
										{#each upcomingReservations as reservation (reservation.reservationId)}
											{@const status = reservationStatus(reservation)}
											<article class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
												<div class="flex flex-wrap items-start justify-between gap-3">
													<div class="space-y-1">
														<p class="font-display text-2xl font-bold text-white">{reservation.clubName}</p>
														<p class="font-mono text-xs font-semibold text-violet-300">
															{reservationDateLine(reservation)}
														</p>
														<p class="text-sm text-zinc-400">
															{reservation.tableType} · Capacity {reservation.capacity}
														</p>
													</div>
													<span class={`font-mono inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
														{statusLabel(status)}
													</span>
												</div>

												<div class="mt-3 flex flex-wrap items-center gap-4">
													<div class="flex items-center gap-1.5">
														<span class="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
														<span class="font-mono text-[11px] tracking-[0.05em] text-zinc-300">
															{reservation.acceptedCount} ACCEPTED
														</span>
													</div>
													<div class="flex items-center gap-1.5">
														<span class="h-1.5 w-1.5 rounded-full bg-pink-400"></span>
														<span class="font-mono text-[11px] tracking-[0.05em] text-zinc-300">
															{reservation.declinedCount} DECLINED
														</span>
													</div>
												</div>

												{#if reservation.notes}
													<p class="mt-3 text-sm text-zinc-400">{reservation.notes}</p>
												{/if}

												<div class="mt-4 flex flex-wrap items-center gap-2">
													<a
														href={`/r/${reservation.reservationId}/host`}
														class="font-display inline-flex h-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-violet-700 px-3 text-xs font-bold text-white shadow-[0_0_14px_rgba(168,85,247,0.35)]"
													>
														Host hub
													</a>
													<a
														href={`/r/${reservation.reservationId}/checkin`}
														class="inline-flex h-8 items-center justify-center rounded-md border border-zinc-700 bg-[#1A1A22] px-3 text-xs font-semibold text-zinc-300 transition hover:text-white"
													>
														Check-in
													</a>
													<button
														type="button"
														class="inline-flex h-8 items-center justify-center rounded-md border border-transparent bg-transparent px-3 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300 disabled:opacity-60"
														disabled={copyingReservationId === reservation.reservationId}
														onclick={() => copyInvite(reservation.reservationId)}
													>
														{copyButtonText(reservation.reservationId)}
													</button>
												</div>
											</article>
										{/each}
									</div>
								</section>
							{/if}

							{#if liveReservations.length > 0}
								<section class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<h2 class="font-display text-2xl font-bold text-white">Live</h2>
										<span class="font-mono inline-flex items-center rounded-full border border-cyan-500/35 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
											{liveReservations.length}
										</span>
									</div>
									<div class="space-y-4">
										{#each liveReservations as reservation (reservation.reservationId)}
											{@const status = reservationStatus(reservation)}
											<article class="rounded-2xl border border-cyan-500/30 bg-[#14141A] p-6 shadow-[0_0_18px_rgba(34,211,238,0.08)]">
												<div class="flex flex-wrap items-start justify-between gap-3">
													<div class="space-y-1">
														<p class="font-display text-2xl font-bold text-white">{reservation.clubName}</p>
														<p class="font-mono text-xs font-semibold text-cyan-300">
															{reservationDateLine(reservation)}
														</p>
														<p class="text-sm text-zinc-400">
															{reservation.tableType} · Capacity {reservation.capacity}
														</p>
													</div>
													<span class={`font-mono inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
														{statusLabel(status)}
													</span>
												</div>

												<div class="mt-3 flex flex-wrap items-center gap-4">
													<div class="flex items-center gap-1.5">
														<span class="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
														<span class="font-mono text-[11px] tracking-[0.05em] text-zinc-300">
															{reservation.acceptedCount} ACCEPTED
														</span>
													</div>
													<div class="flex items-center gap-1.5">
														<span class="h-1.5 w-1.5 rounded-full bg-pink-400"></span>
														<span class="font-mono text-[11px] tracking-[0.05em] text-zinc-300">
															{reservation.declinedCount} DECLINED
														</span>
													</div>
												</div>

												{#if reservation.notes}
													<p class="mt-3 text-sm text-zinc-400">{reservation.notes}</p>
												{/if}

												<div class="mt-4 flex flex-wrap items-center gap-2">
													<a
														href={`/r/${reservation.reservationId}/host`}
														class="font-display inline-flex h-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-violet-700 px-3 text-xs font-bold text-white shadow-[0_0_14px_rgba(168,85,247,0.35)]"
													>
														Host hub
													</a>
													<a
														href={`/r/${reservation.reservationId}/checkin`}
														class="inline-flex h-8 items-center justify-center rounded-md border border-zinc-700 bg-[#1A1A22] px-3 text-xs font-semibold text-zinc-300 transition hover:text-white"
													>
														Check-in
													</a>
													<button
														type="button"
														class="inline-flex h-8 items-center justify-center rounded-md border border-transparent bg-transparent px-3 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300 disabled:opacity-60"
														disabled={copyingReservationId === reservation.reservationId}
														onclick={() => copyInvite(reservation.reservationId)}
													>
														{copyButtonText(reservation.reservationId)}
													</button>
												</div>
											</article>
										{/each}
									</div>
								</section>
							{/if}

							{#if pastReservations.length > 0}
								<section class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<h2 class="font-display text-2xl font-bold text-white">Past</h2>
										<span class="font-mono inline-flex items-center rounded-full border border-zinc-700 bg-[#1A1A22] px-3 py-1 text-xs font-semibold text-zinc-400">
											{pastReservations.length}
										</span>
									</div>
									<div class="space-y-4">
										{#each pastReservations as reservation (reservation.reservationId)}
											{@const status = reservationStatus(reservation)}
											<article class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
												<div class="flex flex-wrap items-start justify-between gap-3">
													<div class="space-y-1">
														<p class="font-display text-2xl font-bold text-white">{reservation.clubName}</p>
														<p class="font-mono text-xs font-semibold text-zinc-400">
															{reservationDateLine(reservation)}
														</p>
														<p class="text-sm text-zinc-400">
															{reservation.tableType} · Capacity {reservation.capacity}
														</p>
													</div>
													<span class={`font-mono inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
														{statusLabel(status)}
													</span>
												</div>

												<div class="mt-3 flex flex-wrap items-center gap-4">
													<div class="flex items-center gap-1.5">
														<span class="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
														<span class="font-mono text-[11px] tracking-[0.05em] text-zinc-300">
															{reservation.acceptedCount} ACCEPTED
														</span>
													</div>
													<div class="flex items-center gap-1.5">
														<span class="h-1.5 w-1.5 rounded-full bg-pink-400"></span>
														<span class="font-mono text-[11px] tracking-[0.05em] text-zinc-300">
															{reservation.declinedCount} DECLINED
														</span>
													</div>
												</div>

												{#if reservation.notes}
													<p class="mt-3 text-sm text-zinc-400">{reservation.notes}</p>
												{/if}

												<div class="mt-4 flex flex-wrap items-center gap-2">
													<a
														href={`/r/${reservation.reservationId}/host`}
														class="inline-flex h-8 items-center justify-center rounded-md border border-zinc-700 bg-[#1A1A22] px-3 text-xs font-semibold text-zinc-300 transition hover:text-white"
													>
														Host hub
													</a>
													<a
														href={`/r/${reservation.reservationId}/checkin`}
														class="inline-flex h-8 items-center justify-center rounded-md border border-zinc-700 bg-[#1A1A22] px-3 text-xs font-semibold text-zinc-300 transition hover:text-white"
													>
														Check-in
													</a>
													<button
														type="button"
														class="inline-flex h-8 items-center justify-center rounded-md border border-transparent bg-transparent px-3 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300 disabled:opacity-60"
														disabled={copyingReservationId === reservation.reservationId}
														onclick={() => copyInvite(reservation.reservationId)}
													>
														{copyButtonText(reservation.reservationId)}
													</button>
												</div>
											</article>
										{/each}
									</div>
								</section>
							{/if}
						</div>
					{/if}
				</section>
			{/if}
		</section>
	</main>
</div>
