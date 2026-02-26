<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import type { Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import CapacityMeter from '$lib/components/common/capacity-meter.svelte';
	import GuestKpiStrip from '$lib/components/common/guest-kpi-strip.svelte';
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import {
		isHostForReservation,
		listenToGuests,
		listenToReservationPublic,
		setGuestListVisibility
	} from '$lib/firebase/firestore';
	import type { GuestRecord, ReservationPublicRecord } from '$lib/types/models';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { cn } from '$lib/utils/cn';
	import { formatPhone } from '$lib/utils/format';
	import { inviteUrl } from '$lib/utils/links';

	type GuestWithId = GuestRecord & { uid: string };
	type FilterTab = 'all' | 'accepted' | 'declined' | 'invited' | 'checked-in';

	const reservationId = $derived($page.params.id ?? '');

	let reservationPublic = $state<ReservationPublicRecord | null>(null);
	let guests = $state<GuestWithId[]>([]);
	let loading = $state(true);
	let hostAccess = $state<'pending' | 'allowed' | 'denied'>('pending');
	let search = $state('');
	let filter = $state<FilterTab>('all');
	let guestListVisibilityPending = $state(false);

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

	function guestStatus(record: GuestWithId): 'accepted' | 'declined' | 'invited' | 'checked-in' {
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
	const hasActiveFilters = $derived(search.trim().length > 0 || filter !== 'all');
	const filteredCountLabel = $derived(
		`${filteredGuests.length} ${filteredGuests.length === 1 ? 'guest' : 'guests'} shown`
	);

	async function copyInvite(): Promise<void> {
		try {
			await navigator.clipboard.writeText(inviteUrl(reservationId));
			pushToast({
				title: 'Invite copied',
				description: inviteUrl(reservationId),
				variant: 'success'
			});
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
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-8">
	<section class="motion-stagger space-y-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="space-y-1">
				<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Host Hub</p>
				<h1 class="section-title">Reservation guest management</h1>
				<p class="section-lead">Search, filter, and monitor confirmations in real time.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={copyInvite}>Copy invite link</Button>
				<a class={cn(buttonVariants({ variant: 'default', size: 'md' }))} href={`/r/${reservationId}/checkin`}>
					Open check-in
				</a>
			</div>
		</div>

		{#if loading}
			<Card>
				<CardContent class="p-6">
					<p class="state-panel-muted" aria-live="polite">Loading host dashboard...</p>
				</CardContent>
			</Card>
		{:else if hostAccess === 'denied'}
			<Card>
				<CardHeader>
					<CardTitle>Access denied</CardTitle>
					<CardDescription>Only the reservation host can open this page.</CardDescription>
				</CardHeader>
				<CardContent>
					<a class={cn(buttonVariants({ variant: 'default', size: 'md' }))} href={`/r/${reservationId}`}>
						Go to guest page
					</a>
				</CardContent>
			</Card>
		{:else}
			<GuestKpiStrip {acceptedCount} {declinedCount} {noResponseCount} {checkedInCount} />

			<div class="grid gap-4 lg:grid-cols-[1fr_320px]">
				<Card class="min-h-[540px] overflow-hidden">
					<div class="border-b border-border/70 bg-card/95 p-4">
						<div class="space-y-3">
							<div class="relative">
								<Input
									id="host-search"
									type="search"
									placeholder="Search by name or phone..."
									bind:value={search}
									class="h-12 pr-20 text-base"
								/>
								<span
									class="inline-kbd absolute right-3 top-1/2 -translate-y-1/2"
								>
									Press /
								</span>
							</div>

							<Tabs>
								<TabsList class="grid h-auto w-full grid-cols-5 gap-1">
									<TabsTrigger class="w-full justify-center px-2 text-center" active={filter === 'all'} onclick={() => (filter = 'all')}>All</TabsTrigger>
									<TabsTrigger class="w-full justify-center px-2 text-center" active={filter === 'accepted'} onclick={() => (filter = 'accepted')}>
										Accepted
									</TabsTrigger>
									<TabsTrigger class="w-full justify-center px-2 text-center" active={filter === 'checked-in'} onclick={() => (filter = 'checked-in')}>
										Checked In
									</TabsTrigger>
									<TabsTrigger class="w-full justify-center px-2 text-center" active={filter === 'declined'} onclick={() => (filter = 'declined')}>
										Declined
									</TabsTrigger>
									<TabsTrigger class="w-full justify-center px-2 text-center" active={filter === 'invited'} onclick={() => (filter = 'invited')}>
										Invited
									</TabsTrigger>
								</TabsList>
								<TabsContent></TabsContent>
							</Tabs>

							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-xs text-muted-foreground" aria-live="polite">{filteredCountLabel}</p>
								{#if hasActiveFilters}
									<Button size="sm" variant="ghost" onclick={clearFilters}>Clear filters</Button>
								{/if}
							</div>
						</div>
					</div>

					<div class="scrollbar-none max-h-[62vh] overflow-auto">
						<div class="hidden md:block">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Phone</TableHead>
										<TableHead>Status</TableHead>
										<TableHead class="text-right">Plus-ones</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#if filteredGuests.length === 0}
										<TableRow>
											<TableCell colspan={4} class="py-7 text-center text-sm text-muted-foreground">
												No guests match this view.
												{#if hasActiveFilters}
													<button
														type="button"
														class="ml-2 text-primary underline-offset-2 hover:underline"
														onclick={clearFilters}
													>
														Clear filters
													</button>
												{/if}
											</TableCell>
										</TableRow>
									{:else}
										{#each filteredGuests as guest (guest.uid)}
											<TableRow class="h-14">
												<TableCell>
													<div class="space-y-1">
														<p class="text-sm font-medium">{guest.displayName}</p>
													</div>
												</TableCell>
												<TableCell class="text-muted-foreground">{formatPhone(guest.phone)}</TableCell>
												<TableCell>
													<StatusChip status={guestStatus(guest)} />
												</TableCell>
												<TableCell class="text-right text-muted-foreground">
													{guest.plusOnes?.length ?? 0}
												</TableCell>
											</TableRow>
										{/each}
									{/if}
								</TableBody>
							</Table>
						</div>

						<div class="space-y-3 p-3 md:hidden">
							{#if filteredGuests.length === 0}
								<div class="state-panel-muted px-4 py-5">
									<p>No guests match this view.</p>
									{#if hasActiveFilters}
										<Button size="sm" variant="ghost" class="mt-3" onclick={clearFilters}>Clear filters</Button>
									{/if}
								</div>
							{:else}
								{#each filteredGuests as guest (guest.uid)}
									<div class="rounded-2xl border border-border/70 bg-secondary/20 p-4">
										<div class="flex items-start justify-between gap-3">
											<div>
												<p class="text-base font-medium">{guest.displayName}</p>
												<p class="text-sm text-muted-foreground">{formatPhone(guest.phone)}</p>
											</div>
											<StatusChip status={guestStatus(guest)} />
										</div>
										<p class="mt-3 text-xs text-muted-foreground">
											{guest.plusOnes?.length ?? 0} plus-ones
										</p>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</Card>

				<div class="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Public guest list</CardTitle>
							<CardDescription>
								Control whether accepted attendee names are shown on the invite page.
							</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="flex items-center justify-between gap-4 rounded-2xl border border-border/75 bg-secondary/20 p-4">
								<div class="space-y-1">
									<p class="text-sm font-medium text-foreground">
										{publicGuestListVisible ? 'Visible on invite page' : 'Hidden from invite page'}
									</p>
									<p class="text-xs text-muted-foreground">
										{publicGuestListVisible
											? 'Guests can see accepted names in first-name format.'
											: 'Only host and check-in views can see the full guest list.'}
									</p>
								</div>
								<Switch
									checked={publicGuestListVisible}
									disabled={guestListVisibilityPending}
									on:toggle={(event) => {
										void updateGuestListVisibility(event.detail);
									}}
								/>
							</div>
							{#if guestListVisibilityPending}
								<p class="text-xs text-muted-foreground">Saving visibility setting...</p>
							{/if}
						</CardContent>
					</Card>

					{#if reservationPublic}
						<CapacityMeter
							capacity={reservationPublic.capacity}
							accepted={reservationPublic.acceptedCount}
							declined={reservationPublic.declinedCount}
						/>
					{/if}

					<Card>
						<CardHeader>
							<CardTitle>Quick stats</CardTitle>
						</CardHeader>
						<CardContent class="space-y-2 text-sm text-muted-foreground">
							<p>{guests.length} total guests</p>
							<p>{acceptedCount} accepted</p>
							<p>{declinedCount} declined</p>
							<p>{noResponseCount} no response</p>
							<p>{checkedInCount} checked in</p>
						</CardContent>
					</Card>
				</div>
			</div>
		{/if}
	</section>
</main>
