<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Keyboard, Search, Undo2, UserRound } from 'lucide-svelte';
	import { onDestroy, onMount } from 'svelte';
	import type { Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import {
		isHostForReservation,
		listenToGuests,
		toggleGuestCheckIn
	} from '$lib/firebase/firestore';
	import type { GuestRecord } from '$lib/types/models';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import {
		clearPendingGuest,
		createUndoCheckInToast,
		isGuestEligibleForCheckIn,
		resolveGuestCheckInState
	} from '$lib/utils/checkin';
	import { formatPhone } from '$lib/utils/format';

	type GuestWithId = GuestRecord & { uid: string };
	type GuestVisualStatus = 'checked-in' | 'accepted' | 'declined' | 'invited';

	const reservationId = $derived($page.params.id ?? '');

	let guests = $state<GuestWithId[]>([]);
	let loading = $state(true);
	let hostAccess = $state<'pending' | 'allowed' | 'denied'>('pending');
	let search = $state('');
	let pending = $state<Record<string, boolean>>({});
	let selectedGuestUid = $state('');

	let guestsUnsubscribe: Unsubscribe | null = null;

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}

		const tag = target.tagName;
		return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
	}

	function focusCheckinSearch(): void {
		const searchElement = document.getElementById('checkin-search');
		if (!(searchElement instanceof HTMLInputElement)) {
			return;
		}

		searchElement.focus();
		searchElement.select();
	}

	function clearSearch(): void {
		search = '';
	}

	function initialsFromName(displayName: string): string {
		return displayName
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((value) => value[0]?.toUpperCase() ?? '')
			.join('');
	}

	function guestVisualStatus(guest: GuestWithId): GuestVisualStatus {
		if (isCheckedIn(guest)) {
			return 'checked-in';
		}

		if (guest.status === 'accepted') {
			return 'accepted';
		}

		if (guest.status === 'declined') {
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

	function guestStatusDotClass(status: GuestVisualStatus): string {
		if (status === 'checked-in') {
			return 'bg-cyan-300';
		}

		if (status === 'accepted') {
			return 'bg-violet-400';
		}

		if (status === 'declined') {
			return 'bg-pink-400';
		}

		return 'bg-zinc-500';
	}

	function guestStatusBadgeClass(status: GuestVisualStatus): string {
		if (status === 'checked-in') {
			return 'bg-cyan-500/15 text-cyan-300';
		}

		if (status === 'accepted') {
			return 'bg-violet-500/15 text-violet-300';
		}

		if (status === 'declined') {
			return 'bg-pink-500/15 text-pink-300';
		}

		return 'bg-zinc-500/15 text-zinc-400';
	}

	function timestampDate(value: GuestWithId['checkedInAt'] | GuestWithId['updatedAt'] | null): Date | null {
		if (!value || !('toDate' in value)) {
			return null;
		}

		return value.toDate();
	}

	function formatRelativeTime(date: Date): string {
		const diff = Date.now() - date.getTime();
		if (!Number.isFinite(diff) || diff <= 0) {
			return 'just now';
		}

		const minute = 60_000;
		const hour = 60 * minute;
		const day = 24 * hour;

		if (diff < minute) {
			return 'just now';
		}

		if (diff < hour) {
			return `${Math.floor(diff / minute)}m ago`;
		}

		if (diff < day) {
			return `${Math.floor(diff / hour)}h ago`;
		}

		return `${Math.floor(diff / day)}d ago`;
	}

	function guestMetaLine(guest: GuestWithId): string {
		const plusOneCount = guest.plusOnes?.length ?? 0;
		const plusOneText = `${plusOneCount} ${plusOneCount === 1 ? 'plus-one' : 'plus-ones'}`;
		const visualStatus = guestVisualStatus(guest);
		const statusText = guestStatusLabel(visualStatus);
		const sourceDate = visualStatus === 'checked-in' ? timestampDate(guest.checkedInAt) : timestampDate(guest.updatedAt);
		if (!sourceDate) {
			return `${plusOneText} · ${statusText}`;
		}

		return `${plusOneText} · ${statusText} ${formatRelativeTime(sourceDate)}`;
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
					hostAccess = 'denied';
					loading = false;
					return;
				}

				if (!$currentUser) {
					const destination = `${$page.url.pathname}${$page.url.search}`;
					const authResult = await openAuthModal({ returnTo: destination, source: 'checkin-gate' });
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
				guestsUnsubscribe = listenToGuests(reservationId, (value) => {
					guests = value;
					loading = false;
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
			if (event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			if (event.key === '/') {
				if (isTypingTarget(event.target)) {
					return;
				}

				event.preventDefault();
				focusCheckinSearch();
				return;
			}

			if (hostAccess !== 'allowed' || filteredGuests.length === 0 || isTypingTarget(event.target)) {
				return;
			}

			if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveSelection(1);
				return;
			}

			if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveSelection(-1);
				return;
			}

			if (event.key === 'Enter') {
				if (event.repeat || !selectedGuest) {
					return;
				}

				event.preventDefault();
				void handleToggleCheckIn(selectedGuest);
			}
		};

		window.addEventListener('keydown', handler);
		return () => {
			window.removeEventListener('keydown', handler);
		};
	});

	onDestroy(() => {
		guestsUnsubscribe?.();
	});

	function isCheckedIn(guest: GuestWithId): boolean {
		return resolveGuestCheckInState(guest.uid, guest.checkedInAt, pending);
	}

	function isEligibleForCheckIn(guest: GuestWithId): boolean {
		return isGuestEligibleForCheckIn(guest.status);
	}

	function isPending(guest: GuestWithId): boolean {
		return pending[guest.uid] !== undefined;
	}

	async function handleToggleCheckIn(guest: GuestWithId, isUndo = false): Promise<void> {
		if (!$currentUser) {
			return;
		}

		if (pending[guest.uid] !== undefined) {
			return;
		}

		if (!isEligibleForCheckIn(guest)) {
			pushToast({
				title: 'Cannot check in',
				description: 'Guest must accept RSVP before check-in.',
				variant: 'destructive'
			});
			return;
		}

		const wasCheckedIn = isCheckedIn(guest);
		const nextValue = !wasCheckedIn;
		pending = { ...pending, [guest.uid]: nextValue };

		try {
			await toggleGuestCheckIn(reservationId, guest.uid, nextValue, $currentUser.uid);
			pending = clearPendingGuest(pending, guest.uid);

			// Show success toast with undo action (skip for undo actions to avoid loops)
			if (!isUndo) {
				const guestName = guest.displayName;
				pushToast(
					createUndoCheckInToast(nextValue, guestName, () => {
						// Find the updated guest from current state
						const updatedGuest = guests.find((g) => g.uid === guest.uid);
						if (updatedGuest) {
							void handleToggleCheckIn(updatedGuest, true);
						}
					}),
					5000
				);
			}
		} catch {
			pending = clearPendingGuest(pending, guest.uid);

			pushToast({
				title: 'Check-in failed',
				description: 'Could not update check-in. Try again.',
				variant: 'destructive'
			});
		}
	}

	const normalizedSearch = $derived(search.trim().toLowerCase());
	const filteredGuests = $derived.by(() =>
		guests.filter((guest) => {
			if (!normalizedSearch) {
				return true;
			}

			return (
				guest.displayName.toLowerCase().includes(normalizedSearch) ||
				guest.phone.toLowerCase().includes(normalizedSearch)
			);
		})
	);

	const selectedGuest = $derived.by(
		() => filteredGuests.find((guest) => guest.uid === selectedGuestUid) ?? null
	);
	const acceptedCount = $derived(guests.filter((guest) => guest.status === 'accepted').length);
	const declinedCount = $derived(guests.filter((guest) => guest.status === 'declined').length);
	const noResponseCount = $derived(guests.filter((guest) => guest.status === 'invited').length);
	const checkedInCount = $derived(guests.filter((guest) => guest.checkedInAt).length);
	const pendingCount = $derived(Object.keys(pending).length);
	const searchActive = $derived(search.trim().length > 0);

	function moveSelection(direction: 1 | -1): void {
		if (filteredGuests.length === 0) {
			return;
		}

		const currentIndex = filteredGuests.findIndex((guest) => guest.uid === selectedGuestUid);
		const safeCurrentIndex = currentIndex < 0 ? 0 : currentIndex;
		const nextIndex =
			(safeCurrentIndex + direction + filteredGuests.length) % filteredGuests.length;
		selectedGuestUid = filteredGuests[nextIndex].uid;

		queueMicrotask(() => {
			const selectedElement = document.querySelector(`[data-guest-id="${selectedGuestUid}"]`);
			if (selectedElement instanceof HTMLElement) {
				selectedElement.scrollIntoView({ block: 'nearest' });
			}
		});
	}

	$effect(() => {
		if (filteredGuests.length === 0) {
			selectedGuestUid = '';
			return;
		}

		if (!filteredGuests.some((guest) => guest.uid === selectedGuestUid)) {
			selectedGuestUid = filteredGuests[0].uid;
		}
	});

	function guestCardClass(guest: GuestWithId, isSelected: boolean): string {
		const checkedIn = isCheckedIn(guest);
		if (checkedIn && isSelected) {
			return 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_28px_rgba(34,211,238,0.14)]';
		}

		if (checkedIn) {
			return 'border-cyan-500/40 bg-[#14141A] shadow-[0_0_28px_rgba(34,211,238,0.08)]';
		}

		if (isSelected) {
			return 'border-violet-500/65 bg-violet-500/10 shadow-[0_0_24px_rgba(168,85,247,0.12)]';
		}

		return 'border-zinc-800 bg-[#14141A]';
	}

	function guestActionClass(guest: GuestWithId): string {
		if (isCheckedIn(guest)) {
			return 'border-zinc-700 bg-[#1A1A22] text-zinc-300 hover:text-white';
		}

		if (!isEligibleForCheckIn(guest)) {
			return 'border-zinc-800 bg-[#1A1A22] text-zinc-600';
		}

		return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:text-cyan-100';
	}
</script>

<div class="min-h-screen bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<AppHeader />

	<main class="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 lg:px-20">
		<section class="space-y-6">
			<h1 class="text-[28px] font-extrabold uppercase tracking-[0.04em] text-white" style="font-family: 'Space Grotesk', sans-serif;">
				FAST ENTRY WORKFLOW
			</h1>

			{#if loading}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-10 text-sm text-zinc-400">
					Loading door list...
				</div>
			{:else if hostAccess === 'denied'}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
					<p class="text-lg font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">
						Access denied
					</p>
					<p class="mt-2 text-sm text-zinc-400">Only the reservation host can access check-in.</p>
					<a
						href={`/r/${reservationId}`}
						class="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-5 text-sm font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						Open guest page
					</a>
				</div>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<div class="flex items-center justify-between rounded-xl border border-zinc-800 bg-[#14141A] px-5 py-3.5">
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 rounded-full bg-violet-500"></span>
							<span class="text-xs text-zinc-400" style="font-family: 'Space Mono', monospace;">Accepted</span>
						</div>
						<p class="text-2xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{acceptedCount}</p>
					</div>
					<div class="flex items-center justify-between rounded-xl border border-zinc-800 bg-[#14141A] px-5 py-3.5">
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 rounded-full bg-pink-500"></span>
							<span class="text-xs text-zinc-400" style="font-family: 'Space Mono', monospace;">Declined</span>
						</div>
						<p class="text-2xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{declinedCount}</p>
					</div>
					<div class="flex items-center justify-between rounded-xl border border-zinc-800 bg-[#14141A] px-5 py-3.5">
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 rounded-full bg-zinc-500"></span>
							<span class="text-xs text-zinc-400" style="font-family: 'Space Mono', monospace;">No Response</span>
						</div>
						<p class="text-2xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">{noResponseCount}</p>
					</div>
					<div class="flex items-center justify-between rounded-xl border border-cyan-500/30 bg-[#14141A] px-5 py-3.5">
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 rounded-full bg-cyan-400"></span>
							<span class="text-xs font-semibold text-cyan-300" style="font-family: 'Space Mono', monospace;">Checked In</span>
						</div>
						<p class="text-2xl font-extrabold text-cyan-300" style="font-family: 'Space Grotesk', sans-serif;">{checkedInCount}</p>
					</div>
				</div>

				<div class="mx-auto w-full max-w-[1040px] space-y-5 pt-1">
					<section class="overflow-hidden rounded-2xl border border-zinc-800 bg-[#14141A]">
						<div class="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-4 sm:px-6">
							<div class="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-lg border border-zinc-800 bg-[#0F1118] px-3 py-3">
								<Search class="h-4 w-4 shrink-0 text-zinc-600" />
								<input
									id="checkin-search"
									type="search"
									placeholder="Search name or phone..."
									bind:value={search}
									class="w-full border-none bg-transparent p-0 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
								/>
								<span
									class="shrink-0 rounded-md border border-zinc-800 bg-[#1A1A22] px-2.5 py-1 text-[11px] text-zinc-500"
									style="font-family: 'Space Mono', monospace;"
								>
									PRESS /
								</span>
							</div>

							<div class="rounded-lg border border-zinc-800 bg-[#1A1A22] px-3 py-2" aria-live="polite">
								<p class="text-[11px] font-semibold text-cyan-300" style="font-family: 'Space Mono', monospace;">
									{checkedInCount} checked in
								</p>
								<p class="mt-0.5 text-[11px] text-zinc-500" style="font-family: 'Space Mono', monospace;">
									{acceptedCount} accepted
								</p>
							</div>

							<a
								href={`/r/${reservationId}/host`}
								class="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 bg-[#1A1A22] px-5 text-sm font-semibold text-zinc-300 transition hover:text-white"
							>
								Host hub
							</a>
						</div>

						<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
							<div class="flex items-center gap-2 text-xs text-zinc-500">
								<Keyboard class="h-3.5 w-3.5" />
								<p>Use Up/Down to move and Enter to toggle check-in.</p>
							</div>
							<div class="flex items-center gap-3">
								{#if pendingCount > 0}
									<p class="text-xs text-zinc-500">Saving {pendingCount} update{pendingCount === 1 ? '' : 's'}...</p>
								{/if}
								{#if searchActive}
									<button
										type="button"
										class="text-xs font-semibold text-zinc-400 transition hover:text-zinc-200"
										onclick={clearSearch}
									>
										Clear search
									</button>
								{/if}
							</div>
						</div>
					</section>

					{#if filteredGuests.length === 0}
						<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-10 text-center text-sm text-zinc-400" aria-live="polite">
							<p>No guests found.</p>
						</div>
					{:else}
						<div class="space-y-4">
							{#each filteredGuests as guest (guest.uid)}
								<div
									class={`rounded-2xl border p-5 transition ${guestCardClass(guest, selectedGuestUid === guest.uid)}`}
									role="button"
									tabindex="0"
									aria-label={`Select guest ${guest.displayName}`}
									aria-busy={isPending(guest)}
									data-guest-id={guest.uid}
									onclick={() => {
										selectedGuestUid = guest.uid;
									}}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											selectedGuestUid = guest.uid;
										}
									}}
								>
									<div class="flex flex-wrap items-start justify-between gap-4">
										<div class="flex min-w-0 items-center gap-3">
											<div class="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/15">
												{#if initialsFromName(guest.displayName)}
													<span class="text-sm font-bold text-cyan-300" style="font-family: 'Space Mono', monospace;">
														{initialsFromName(guest.displayName)}
													</span>
												{:else}
													<UserRound class="h-5 w-5 text-cyan-300" />
												{/if}
											</div>
											<div class="min-w-0">
												<p class="truncate text-lg font-bold text-white sm:text-xl" style="font-family: 'Space Grotesk', sans-serif;">
													{guest.displayName}
												</p>
												<p class="truncate text-xs text-zinc-400" style="font-family: 'Space Mono', monospace;">
													{guestMetaLine(guest)}
												</p>
											</div>
										</div>

										<span
											class={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${guestStatusBadgeClass(guestVisualStatus(guest))}`}
											style="font-family: 'Space Mono', monospace;"
										>
											<span class={`h-1.5 w-1.5 rounded-full ${guestStatusDotClass(guestVisualStatus(guest))}`}></span>
											{guestStatusLabel(guestVisualStatus(guest))}
										</span>
									</div>

									<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
										<p class="text-sm text-zinc-500">{formatPhone(guest.phone)}</p>

										<button
											type="button"
											class={`inline-flex min-w-[150px] items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${guestActionClass(guest)} ${isPending(guest) ? 'opacity-70' : ''}`}
											disabled={isPending(guest) || !isEligibleForCheckIn(guest)}
											onclick={(event) => {
												event.stopPropagation();
												void handleToggleCheckIn(guest);
											}}
										>
											{#if isCheckedIn(guest)}
												<Undo2 class="h-4 w-4" />
											{/if}
											{isPending(guest) ? 'Saving...' : isCheckedIn(guest) ? 'Undo Check-in' : 'Check In'}
										</button>
									</div>

									{#if !isEligibleForCheckIn(guest)}
										<p class="mt-3 text-xs text-zinc-500">Guest must accept RSVP first.</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</main>
</div>
