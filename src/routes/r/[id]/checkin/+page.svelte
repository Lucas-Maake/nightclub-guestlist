<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import type { Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import GuestKpiStrip from '$lib/components/common/guest-kpi-strip.svelte';
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
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
	import { cn } from '$lib/utils/cn';
	import { formatPhone } from '$lib/utils/format';

	type GuestWithId = GuestRecord & { uid: string };

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
</script>

<AppHeader compact />

<main class="app-shell py-4 sm:py-6">
	<section class="motion-stagger space-y-4">
		<div class="space-y-1">
			<h1 class="section-title">Fast entry workflow</h1>
		</div>

		{#if loading}
			<Card>
				<CardContent class="p-6">
					<p class="state-panel-muted" aria-live="polite">Loading door list...</p>
				</CardContent>
			</Card>
		{:else if hostAccess === 'denied'}
			<Card>
				<CardHeader>
					<CardTitle>Access denied</CardTitle>
					<CardDescription>Only the reservation host can access check-in.</CardDescription>
				</CardHeader>
				<CardContent>
					<a class={cn(buttonVariants({ variant: 'default', size: 'md' }))} href={`/r/${reservationId}`}>
						Open guest page
					</a>
				</CardContent>
			</Card>
		{:else}
			<GuestKpiStrip {acceptedCount} {declinedCount} {noResponseCount} {checkedInCount} />

			<Card class="overflow-hidden">
				<div class="border-b border-border/70 bg-card/95 p-4">
					<div class="grid gap-3 md:grid-cols-[1fr_auto] xl:grid-cols-[1fr_auto_auto]">
						<div class="space-y-2">
							<div class="relative">
								<Input
									id="checkin-search"
									type="search"
									placeholder="Search name or phone..."
									class="h-12 pr-20 text-base"
									bind:value={search}
								/>
								<span
									class="inline-kbd absolute right-3 top-1/2 -translate-y-1/2"
								>
									Press /
								</span>
							</div>
							<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<p>Use Up/Down to move and Enter to toggle check-in.</p>
								{#if searchActive}
									<Button size="sm" variant="ghost" onclick={clearSearch}>Clear search</Button>
								{/if}
							</div>
						</div>
						<div class="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-2 text-sm text-muted-foreground" aria-live="polite">
							<p>{checkedInCount} checked in</p>
							<p class="text-xs text-muted-foreground">{acceptedCount} accepted</p>
							{#if pendingCount > 0}
								<p class="text-xs text-muted-foreground">Saving {pendingCount} update{pendingCount === 1 ? '' : 's'}...</p>
							{/if}
						</div>
						<a
							class={cn(buttonVariants({ variant: 'outline', size: 'md' }))}
							href={`/r/${reservationId}/host`}
						>
							Host hub
						</a>
					</div>
				</div>

				<CardContent class="max-h-[72vh] space-y-3 overflow-auto p-3 sm:p-4">
					{#if filteredGuests.length === 0}
						<div class="state-panel-muted px-4 py-6 text-center" aria-live="polite">
							<p>No guests found.</p>
							{#if searchActive}
								<Button size="sm" variant="ghost" class="mt-3" onclick={clearSearch}>Clear search</Button>
							{/if}
						</div>
					{:else}
						{#each filteredGuests as guest (guest.uid)}
							<div
								class={cn(
									'rounded-2xl border p-4 transition-colors',
									selectedGuestUid === guest.uid
										? 'border-primary/55 bg-primary/10 shadow-surface'
										: 'border-border/70 bg-secondary/18'
								)}
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
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="space-y-1">
										<p class="text-base font-medium text-foreground sm:text-lg">{guest.displayName}</p>
										<p class="text-sm text-muted-foreground">{formatPhone(guest.phone)}</p>
									</div>
									<StatusChip status={isCheckedIn(guest) ? 'checked-in' : guest.status} />
								</div>

								<div class="mt-4 flex flex-wrap gap-3">
									<Button
										size="lg"
										variant={isCheckedIn(guest) ? 'outline' : 'success'}
										class="min-w-[150px]"
										disabled={isPending(guest)}
										onclick={() => handleToggleCheckIn(guest)}
									>
										{isPending(guest) ? 'Saving...' : isCheckedIn(guest) ? 'Undo Check-in' : 'Check In'}
									</Button>
									{#if !isEligibleForCheckIn(guest)}
										<p class="self-center text-xs text-muted-foreground">
											Guest must accept RSVP first.
										</p>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</CardContent>
			</Card>
		{/if}
	</section>
</main>
