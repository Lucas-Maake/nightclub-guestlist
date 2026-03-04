<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { Search, Users } from 'lucide-svelte';
	import type { Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import {
		isHostForReservation,
		listenToGuests,
		listenToReservationPublic,
		setGuestListVisibility,
		setPlusOnesEnabled
	} from '$lib/firebase/firestore';
	import type { GuestRecord, ReservationPublicRecord } from '$lib/types/models';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { formatPhone } from '$lib/utils/format';
	import { inviteUrl } from '$lib/utils/links';

	type GuestWithId = GuestRecord & { uid: string };
	type FilterTab = 'all' | 'accepted' | 'declined' | 'invited' | 'checked-in';
	type GuestVisualStatus = 'accepted' | 'declined' | 'invited' | 'checked-in';

	const reservationId = $derived($page.params.id ?? '');
	const subtitleDateFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});

	let reservationPublic = $state<ReservationPublicRecord | null>(null);
	let guests = $state<GuestWithId[]>([]);
	let loading = $state(true);
	let hostAccess = $state<'pending' | 'allowed' | 'denied'>('pending');
	let search = $state('');
	let filter = $state<FilterTab>('all');
	let guestListVisibilityPending = $state(false);
	let plusOnesTogglePending = $state(false);
	let inviteCopied = $state(false);

	let publicUnsubscribe: Unsubscribe | null = null;
	let guestsUnsubscribe: Unsubscribe | null = null;

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}

		const tag = target.tagName;
		return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
	}

	function focusHostSearch(): void {
		const searchElement = document.getElementById('host-search');
		if (!(searchElement instanceof HTMLInputElement)) {
			return;
		}

		searchElement.focus();
		searchElement.select();
	}

	function clearFilters(): void {
		search = '';
		filter = 'all';
	}

	onMount(() => {
		let cancelled = false;

		void (async () => {
			try {
				await waitForAuthReady();
				if (cancelled) {
					return;
				}

				if (!reservationId) {
					loading = false;
					hostAccess = 'denied';
					return;
				}

				if (!$currentUser) {
					const destination = `${$page.url.pathname}${$page.url.search}`;
					const authResult = await openAuthModal({ returnTo: destination, source: 'host-gate' });
					await waitForAuthReady();
					if (cancelled) {
						return;
					}
					if (authResult !== 'authenticated' || !$currentUser) {
						hostAccess = 'denied';
						loading = false;
						await goto(`/r/${reservationId}`, { replaceState: true, noScroll: true });
						return;
					}
				}

				const uid = $currentUser?.uid ?? '';
				if (!uid) {
					hostAccess = 'denied';
					loading = false;
					await goto(`/r/${reservationId}`, { replaceState: true, noScroll: true });
					return;
				}

				const hasHostAccess = await isHostForReservation(reservationId, uid);
				if (!hasHostAccess) {
					hostAccess = 'denied';
					loading = false;
					await goto(`/r/${reservationId}`, { replaceState: true, noScroll: true });
					return;
				}

				hostAccess = 'allowed';
				publicUnsubscribe = listenToReservationPublic(reservationId, (value) => {
					reservationPublic = value;
					loading = false;
				});

				guestsUnsubscribe = listenToGuests(reservationId, (value) => {
					guests = value;
				});
			} catch {
				hostAccess = 'denied';
				loading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			if (isTypingTarget(event.target)) {
				return;
			}

			event.preventDefault();
			focusHostSearch();
		};

		window.addEventListener('keydown', handler);
		return () => {
			window.removeEventListener('keydown', handler);
		};
	});

	onDestroy(() => {
		publicUnsubscribe?.();
		guestsUnsubscribe?.();
	});

	function guestStatus(record: GuestWithId): GuestVisualStatus {
		if (record.checkedInAt) {
			return 'checked-in';
		}

		if (record.status === 'accepted') {
			return 'accepted';
		}

		if (record.status === 'declined') {
			return 'declined';
		}

		return 'invited';
	}

	function guestStatusLabel(status: GuestVisualStatus): string {
		if (status === 'checked-in') {
			return 'Checked In';
		}

		if (status === 'accepted') {
			return 'Accepted';
		}

		if (status === 'declined') {
			return 'Declined';
		}

		return 'Invited';
	}

	function statusDotClass(status: GuestVisualStatus): string {
		if (status === 'accepted') {
			return 'bg-violet-500';
		}

		if (status === 'declined') {
			return 'bg-pink-500';
		}

		if (status === 'checked-in') {
			return 'bg-cyan-400';
		}

		return 'bg-zinc-500';
	}

	function statusBadgeClass(status: GuestVisualStatus): string {
		if (status === 'accepted') {
			return 'bg-violet-500/15 text-violet-400';
		}

		if (status === 'declined') {
			return 'bg-pink-500/15 text-pink-400';
		}

		if (status === 'checked-in') {
			return 'bg-cyan-500/15 text-cyan-300';
		}

		return 'bg-zinc-500/15 text-zinc-400';
	}

	const filteredGuests = $derived.by(() => {
		const normalizedSearch = search.trim().toLowerCase();

		return guests.filter((guest) => {
			const searchMatches =
				normalizedSearch.length === 0 ||
				guest.displayName.toLowerCase().includes(normalizedSearch) ||
				guest.phone.toLowerCase().includes(normalizedSearch);

			const matchesFilter = filter === 'all' ? true : guestStatus(guest) === filter;
			return searchMatches && matchesFilter;
		});
	});

	const acceptedCount = $derived(guests.filter((guest) => guest.status === 'accepted').length);
	const declinedCount = $derived(guests.filter((guest) => guest.status === 'declined').length);
	const noResponseCount = $derived(guests.filter((guest) => guest.status === 'invited').length);
	const checkedInCount = $derived(guests.filter((guest) => guest.checkedInAt).length);
	const guestListVisibility = $derived(reservationPublic?.guestListVisibility ?? 'hidden');
	const publicGuestListVisible = $derived(guestListVisibility === 'visible');
	const plusOnesEnabled = $derived(reservationPublic?.plusOnesEnabled ?? true);
	const hasActiveFilters = $derived(search.trim().length > 0 || filter !== 'all');
	const filteredCountLabel = $derived(
		`${filteredGuests.length} ${filteredGuests.length === 1 ? 'guest' : 'guests'} shown`
	);
	const subtitleLine = $derived.by(() => {
		if (!reservationPublic) {
			return 'Host controls for live reservation management.';
		}

		return `${reservationPublic.clubName} · ${subtitleDateFormatter.format(
			reservationPublic.startAt.toDate()
		)}`;
	});
	const claimedCount = $derived(reservationPublic?.claimedCount ?? acceptedCount);
	const capacity = $derived(reservationPublic?.capacity ?? 0);
	const spotsLeft = $derived(Math.max(capacity - claimedCount, 0));
	const claimedRatioPercent = $derived.by(() => {
		if (capacity <= 0) {
			return 0;
		}

		return Math.max(0, Math.min(100, Math.round((claimedCount / capacity) * 100)));
	});
	const progressFillPercent = $derived.by(() => {
		if (claimedRatioPercent <= 0) {
			return 0;
		}

		return Math.max(claimedRatioPercent, 6);
	});

	async function copyInvite(): Promise<void> {
		try {
			await navigator.clipboard.writeText(inviteUrl(reservationId));
			inviteCopied = true;
			pushToast({
				title: 'Invite copied',
				description: inviteUrl(reservationId),
				variant: 'success'
			});
			setTimeout(() => {
				inviteCopied = false;
			}, 2000);
		} catch {
			pushToast({
				title: 'Copy failed',
				description: 'Could not copy invite link. Try again.',
				variant: 'destructive'
			});
		}
	}

	async function updateGuestListVisibility(nextVisible: boolean): Promise<void> {
		if (!reservationPublic || guestListVisibilityPending) {
			return;
		}

		const nextVisibility = nextVisible ? 'visible' : 'hidden';
		const previousVisibility = reservationPublic.guestListVisibility ?? 'hidden';
		if (nextVisibility === previousVisibility) {
			return;
		}

		guestListVisibilityPending = true;
		reservationPublic = {
			...reservationPublic,
			guestListVisibility: nextVisibility
		};

		try {
			await setGuestListVisibility(reservationId, nextVisibility);
			pushToast({
				title: nextVisible ? 'Public list enabled' : 'Public list hidden',
				description: nextVisible
					? 'Accepted guest names are now visible on the invite page.'
					: 'Guest names are no longer shown on the invite page.',
				variant: 'success'
			});
		} catch {
			reservationPublic = {
				...reservationPublic,
				guestListVisibility: previousVisibility
			};
			pushToast({
				title: 'Update failed',
				description: 'Could not update public list visibility. Try again.',
				variant: 'destructive'
			});
		} finally {
			guestListVisibilityPending = false;
		}
	}

	async function updatePlusOneAvailability(nextEnabled: boolean): Promise<void> {
		if (!reservationPublic || plusOnesTogglePending) {
			return;
		}

		const previousEnabled = reservationPublic.plusOnesEnabled ?? true;
		if (previousEnabled === nextEnabled) {
			return;
		}

		plusOnesTogglePending = true;
		reservationPublic = {
			...reservationPublic,
			plusOnesEnabled: nextEnabled
		};

		try {
			await setPlusOnesEnabled(reservationId, nextEnabled);
			pushToast({
				title: nextEnabled ? 'Plus-ones enabled' : 'Plus-ones disabled',
				description: nextEnabled
					? 'Guests can add plus-one names before saving RSVP.'
					: 'Guests can no longer add plus-one names on the RSVP page.',
				variant: 'success'
			});
		} catch {
			reservationPublic = {
				...reservationPublic,
				plusOnesEnabled: previousEnabled
			};
			pushToast({
				title: 'Update failed',
				description: 'Could not update plus-one settings. Try again.',
				variant: 'destructive'
			});
		} finally {
			plusOnesTogglePending = false;
		}
	}
</script>

<div class="min-h-screen bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<AppHeader />

	<main class="mx-auto w-full max-w-[1440px]">
		<section class="px-5 pb-6 pt-8 sm:px-8 lg:px-20">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="space-y-1">
					<h1 class="text-[28px] font-extrabold uppercase leading-none tracking-wide text-white" style="font-family: 'Space Grotesk', sans-serif;">
						GUEST MANAGEMENT
					</h1>
					<p class="text-xs font-medium text-zinc-500" style="font-family: 'Space Mono', monospace;">
						{subtitleLine}
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						class="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 bg-[#1A1A22] px-5 text-sm font-semibold text-zinc-400 transition hover:text-zinc-200"
						onclick={copyInvite}
					>
						{inviteCopied ? 'Copied!' : 'Copy invite link'}
					</button>
					<a
						href={`/r/${reservationId}/checkin`}
						class="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-5 text-sm font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						Open check-in
					</a>
				</div>
			</div>
		</section>

		<section class="px-5 pb-16 sm:px-8 lg:px-20">
			{#if loading}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-10 text-sm text-zinc-400">
					Loading host dashboard...
				</div>
			{:else if hostAccess === 'denied'}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
					<p class="text-lg font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">
						Access denied
					</p>
					<p class="mt-2 text-sm text-zinc-400">Only the reservation host can open this page.</p>
					<a
						href={`/r/${reservationId}`}
						class="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-5 text-sm font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						Go to guest page
					</a>
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<div class="rounded-2xl border border-violet-500/25 bg-[#14141A] px-6 py-5">
						<div class="flex items-center gap-2.5">
							<span class="h-2.5 w-2.5 rounded-full bg-violet-500"></span>
							<span class="text-[11px] uppercase tracking-[0.14em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Accepted</span>
						</div>
						<p class="mt-2 text-4xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{acceptedCount}</p>
					</div>
					<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-5">
						<div class="flex items-center gap-2.5">
							<span class="h-2.5 w-2.5 rounded-full bg-pink-500"></span>
							<span class="text-[11px] uppercase tracking-[0.14em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Declined</span>
						</div>
						<p class="mt-2 text-4xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{declinedCount}</p>
					</div>
					<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-5">
						<div class="flex items-center gap-2.5">
							<span class="h-2.5 w-2.5 rounded-full bg-zinc-500"></span>
							<span class="text-[11px] uppercase tracking-[0.14em] text-zinc-500" style="font-family: 'Space Mono', monospace;">No response</span>
						</div>
						<p class="mt-2 text-4xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{noResponseCount}</p>
					</div>
					<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-5">
						<div class="flex items-center gap-2.5">
							<span class="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
							<span class="text-[11px] uppercase tracking-[0.14em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Checked in</span>
						</div>
						<p class="mt-2 text-4xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{checkedInCount}</p>
					</div>
				</div>

				<div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
					<section class="min-h-[540px] overflow-hidden rounded-2xl border border-zinc-800 bg-[#14141A]">
						<div class="border-b border-zinc-800 px-5 py-4">
							<div class="flex items-center justify-between gap-3 rounded-lg bg-[#0f1118] px-4 py-3">
								<div class="flex min-w-0 items-center gap-2.5">
									<Search class="h-4 w-4 shrink-0 text-zinc-600" />
									<input
										id="host-search"
										type="search"
										placeholder="Search by name or phone..."
										bind:value={search}
										class="w-full border-none bg-transparent p-0 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
									/>
								</div>
								<span
									class="rounded-md border border-zinc-800 bg-[#1A1A22] px-2.5 py-1 text-[11px] text-zinc-500"
									style="font-family: 'Space Mono', monospace;"
								>
									PRESS /
								</span>
							</div>
						</div>

						<div class="border-b border-zinc-800 px-5">
							<div class="flex flex-wrap items-center gap-1">
								{#each [
									{ key: 'all', label: 'All' },
									{ key: 'accepted', label: 'Accepted' },
									{ key: 'checked-in', label: 'Checked In' },
									{ key: 'declined', label: 'Declined' },
									{ key: 'invited', label: 'Invited' }
								] as tab}
									<button
										type="button"
										class={`border-b-2 px-4 py-2.5 text-sm transition ${
											filter === tab.key
												? 'border-violet-500 font-semibold text-white'
												: 'border-transparent text-zinc-500 hover:text-zinc-300'
										}`}
										style={filter === tab.key ? "font-family: 'Space Grotesk', sans-serif;" : ''}
										onclick={() => (filter = tab.key as FilterTab)}
									>
										{tab.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="flex items-center justify-between gap-3 px-5 py-3">
							<p class="text-xs text-zinc-500" style="font-family: 'Space Mono', monospace;">
								{filteredCountLabel}
							</p>
							{#if hasActiveFilters}
								<button type="button" class="text-xs font-semibold text-zinc-400 transition hover:text-zinc-200" onclick={clearFilters}>
									Clear filters
								</button>
							{/if}
						</div>

						<div class="hidden lg:block">
							<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_100px] gap-4 border-y border-zinc-800 bg-[#1A1A22] px-5 py-2.5">
								<p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Name</p>
								<p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Phone</p>
								<p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Status</p>
								<p class="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Plus-ones</p>
							</div>

							{#if filteredGuests.length === 0}
								<div class="flex min-h-[280px] flex-col items-center justify-center gap-3 px-5 py-10 text-zinc-500">
									<Users class="h-10 w-10" />
									<p class="text-sm">More guests will appear here</p>
								</div>
							{:else}
								{#each filteredGuests as guest (guest.uid)}
									<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_100px] items-center gap-4 border-b border-zinc-800 px-5 py-3.5">
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-white">{guest.displayName}</p>
										</div>
										<p class="truncate text-sm text-zinc-400">{formatPhone(guest.phone)}</p>
										<div>
											<span class={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(guestStatus(guest))}`} style="font-family: 'Space Mono', monospace;">
												<span class={`h-1.5 w-1.5 rounded-full ${statusDotClass(guestStatus(guest))}`}></span>
												{guestStatusLabel(guestStatus(guest))}
											</span>
										</div>
										<p class="text-right text-sm text-zinc-400">{guest.plusOnes?.length ?? 0}</p>
									</div>
								{/each}
							{/if}
						</div>

						<div class="space-y-3 p-3 lg:hidden">
							{#if filteredGuests.length === 0}
								<div class="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-[#0f1118] px-4 py-6 text-zinc-500">
									<Users class="h-8 w-8" />
									<p class="text-sm">More guests will appear here</p>
								</div>
							{:else}
								{#each filteredGuests as guest (guest.uid)}
									<div class="rounded-xl border border-zinc-800 bg-[#0f1118] px-4 py-3">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-white">{guest.displayName}</p>
												<p class="truncate text-xs text-zinc-400">{formatPhone(guest.phone)}</p>
											</div>
											<span class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(guestStatus(guest))}`} style="font-family: 'Space Mono', monospace;">
												<span class={`h-1.5 w-1.5 rounded-full ${statusDotClass(guestStatus(guest))}`}></span>
												{guestStatusLabel(guestStatus(guest))}
											</span>
										</div>
										<p class="mt-3 text-xs text-zinc-500">{guest.plusOnes?.length ?? 0} plus-ones</p>
									</div>
								{/each}
							{/if}
						</div>
					</section>

					<aside class="space-y-5">
						<section class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
							<h2 class="text-[22px] font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Public guest list</h2>
							<p class="mt-2 text-sm text-zinc-400">
								Control whether accepted attendee names are shown on the invite page.
							</p>

							<div class="mt-4 space-y-3">
								<div class="rounded-xl bg-[#1A1A22] p-4">
									<div class="flex items-start justify-between gap-4">
										<div class="min-w-0">
											<p class="text-sm font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">
												{publicGuestListVisible ? 'Visible on invite page' : 'Hidden from invite page'}
											</p>
											<p class="mt-1 text-xs text-zinc-500">
												{publicGuestListVisible
													? 'Guests can see accepted names in first-name format.'
													: 'Only host and check-in views can see the full guest list.'}
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={publicGuestListVisible}
											aria-label="Toggle public guest list visibility"
											disabled={guestListVisibilityPending}
											class={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition ${
												publicGuestListVisible ? 'bg-violet-500' : 'bg-zinc-600'
											} ${guestListVisibilityPending ? 'opacity-60' : ''}`}
											onclick={() => {
												void updateGuestListVisibility(!publicGuestListVisible);
											}}
										>
											<span
												class={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform ${
													publicGuestListVisible ? 'translate-x-[20px]' : 'translate-x-0'
												}`}
											></span>
										</button>
									</div>
								</div>

								<div class="rounded-xl bg-[#1A1A22] p-4">
									<div class="flex items-start justify-between gap-4">
										<div class="min-w-0">
											<p class="text-sm font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">
												{plusOnesEnabled ? 'Plus-ones enabled' : 'Plus-ones disabled'}
											</p>
											<p class="mt-1 text-xs text-zinc-500">
												{plusOnesEnabled
													? 'Guests can add plus-one names before saving RSVP.'
													: 'Guest RSVP page hides plus-one entry and blocks new plus-ones.'}
											</p>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={plusOnesEnabled}
											aria-label="Toggle plus-one availability"
											disabled={plusOnesTogglePending}
											class={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition ${
												plusOnesEnabled ? 'bg-violet-500' : 'bg-zinc-600'
											} ${plusOnesTogglePending ? 'opacity-60' : ''}`}
											onclick={() => {
												void updatePlusOneAvailability(!plusOnesEnabled);
											}}
										>
											<span
												class={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform ${
													plusOnesEnabled ? 'translate-x-[20px]' : 'translate-x-0'
												}`}
											></span>
										</button>
									</div>
								</div>
							</div>

							{#if guestListVisibilityPending}
								<p class="mt-3 text-xs text-zinc-500">Saving visibility setting...</p>
							{/if}
							{#if plusOnesTogglePending}
								<p class="mt-1 text-xs text-zinc-500">Saving plus-one setting...</p>
							{/if}
						</section>

						<section class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
							<div class="flex items-center justify-between gap-3">
								<h2 class="text-[22px] font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Capacity</h2>
								<p class="text-xs text-zinc-400" style="font-family: 'Space Mono', monospace;">
									{claimedCount}/{capacity} spots claimed
								</p>
							</div>

							<div class="mt-4 h-1.5 w-full rounded bg-[#1A1A22]">
								<div
									class="h-1.5 rounded bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
									style={`width:${progressFillPercent}%`}
								></div>
							</div>

							<div class="mt-4 flex items-center justify-between gap-3 text-xs" style="font-family: 'Space Mono', monospace;">
								<p class="font-semibold text-lime-300">{spotsLeft} spots left</p>
								<p class="text-zinc-500">{declinedCount} declined</p>
							</div>
						</section>

						<section class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
							<h2 class="text-[22px] font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Quick stats</h2>
							<div class="mt-3">
								<div class="flex items-center justify-between border-b border-zinc-800 py-2.5">
									<p class="text-sm text-zinc-400">Total guests</p>
									<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{guests.length}</p>
								</div>
								<div class="flex items-center justify-between border-b border-zinc-800 py-2.5">
									<div class="flex items-center gap-2">
										<span class="h-2 w-2 rounded-full bg-violet-500"></span>
										<p class="text-sm text-zinc-400">Accepted</p>
									</div>
									<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{acceptedCount}</p>
								</div>
								<div class="flex items-center justify-between border-b border-zinc-800 py-2.5">
									<div class="flex items-center gap-2">
										<span class="h-2 w-2 rounded-full bg-pink-500"></span>
										<p class="text-sm text-zinc-400">Declined</p>
									</div>
									<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{declinedCount}</p>
								</div>
								<div class="flex items-center justify-between border-b border-zinc-800 py-2.5">
									<div class="flex items-center gap-2">
										<span class="h-2 w-2 rounded-full bg-zinc-500"></span>
										<p class="text-sm text-zinc-400">No response</p>
									</div>
									<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{noResponseCount}</p>
								</div>
								<div class="flex items-center justify-between py-2.5">
									<div class="flex items-center gap-2">
										<span class="h-2 w-2 rounded-full bg-cyan-400"></span>
										<p class="text-sm text-zinc-400">Checked in</p>
									</div>
									<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{checkedInCount}</p>
								</div>
							</div>
						</section>
					</aside>
				</div>
			{/if}
		</section>
	</main>
</div>
