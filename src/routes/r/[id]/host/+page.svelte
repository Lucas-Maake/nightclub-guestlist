<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import type { Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import CapacityMeter from '$lib/components/common/capacity-meter.svelte';
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import {
		getReservationPrivate,
		listenToGuests,
		listenToReservationPublic
	} from '$lib/firebase/firestore';
	import type { GuestRecord, ReservationPublicRecord } from '$lib/types/models';
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

	let publicUnsubscribe: Unsubscribe | null = null;
	let guestsUnsubscribe: Unsubscribe | null = null;

	onMount(async () => {
		await waitForAuthReady();
		if (!reservationId) {
			loading = false;
			hostAccess = 'denied';
			return;
		}

		if (!$currentUser) {
			await goto(`/login?returnTo=${encodeURIComponent($page.url.pathname)}`);
			return;
		}

		const privateReservation = await getReservationPrivate(reservationId);
		if (!privateReservation || privateReservation.hostUid !== $currentUser.uid) {
			hostAccess = 'denied';
			loading = false;
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

	async function copyInvite(): Promise<void> {
		try {
			await navigator.clipboard.writeText(inviteUrl(reservationId));
			pushToast({
				title: 'Invite copied',
				description: inviteUrl(reservationId),
				variant: 'success'
			});
		} catch (error) {
			pushToast({
				title: 'Copy failed',
				description: error instanceof Error ? error.message : 'Unable to copy',
				variant: 'destructive'
			});
		}
	}
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-8">
	<section class="space-y-6">
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
					<p class="text-sm text-muted-foreground">Loading host dashboard...</p>
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
			<div class="grid gap-4 lg:grid-cols-[1fr_320px]">
				<Card class="min-h-[540px] overflow-hidden">
					<div class="sticky top-[68px] z-20 border-b border-border/70 bg-card/95 p-4 backdrop-blur">
						<div class="space-y-3">
							<Input
								type="search"
								placeholder="Search by name or phone..."
								bind:value={search}
								class="h-12 text-base"
							/>

							<Tabs>
								<TabsList class="w-full overflow-x-auto">
									<TabsTrigger active={filter === 'all'} onclick={() => (filter = 'all')}>All</TabsTrigger>
									<TabsTrigger active={filter === 'accepted'} onclick={() => (filter = 'accepted')}>
										Accepted
									</TabsTrigger>
									<TabsTrigger active={filter === 'checked-in'} onclick={() => (filter = 'checked-in')}>
										Checked In
									</TabsTrigger>
									<TabsTrigger active={filter === 'declined'} onclick={() => (filter = 'declined')}>
										Declined
									</TabsTrigger>
									<TabsTrigger active={filter === 'invited'} onclick={() => (filter = 'invited')}>
										Invited
									</TabsTrigger>
								</TabsList>
								<TabsContent></TabsContent>
							</Tabs>
						</div>
					</div>

					<div class="max-h-[62vh] overflow-auto">
						<Table class="hidden md:table">
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
											No guests match this filter.
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

						<div class="space-y-3 p-3 md:hidden">
							{#if filteredGuests.length === 0}
								<p class="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-5 text-sm text-muted-foreground">
									No guests match this filter.
								</p>
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
							<p>{guests.filter((guest) => guest.status === 'accepted').length} accepted</p>
							<p>{guests.filter((guest) => guest.status === 'declined').length} declined</p>
							<p>{guests.filter((guest) => guest.checkedInAt).length} checked in</p>
						</CardContent>
					</Card>
				</div>
			</div>
		{/if}
	</section>
</main>
