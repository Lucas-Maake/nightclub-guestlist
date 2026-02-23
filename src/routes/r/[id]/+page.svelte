<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { onDestroy, onMount } from 'svelte';
import { Timestamp, type Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import CapacityMeter from '$lib/components/common/capacity-meter.svelte';
	import ReservationPreviewCard from '$lib/components/common/reservation-preview-card.svelte';
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input, Label } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rsvpSchema } from '$lib/schemas/reservation';
	import { authReady, currentUser, signInAnonymouslyForDebug, waitForAuthReady } from '$lib/firebase/auth';
	import {
		listenToGuest,
		listenToReservationPublic,
		upsertGuestRsvp,
		validateDebugToken
	} from '$lib/firebase/firestore';
	import type { GuestRecord, ReservationPublicRecord, RsvpInput } from '$lib/types/models';
	import { pushToast } from '$lib/stores/toast';
	import { cn } from '$lib/utils/cn';
	import { canUseDebugMode } from '$lib/utils/security';

	const reservationId = $derived($page.params.id ?? '');

	let reservation = $state<ReservationPublicRecord | null>(null);
	let guest = $state<GuestRecord | null>(null);
	let loadingReservation = $state(true);
	let submitting = $state(false);
	let debugMessage = $state('');
	let errorMessage = $state('');
	let debugAttempted = $state(false);

	let displayName = $state('');
	let status = $state<'accepted' | 'declined'>('accepted');
	let plusOneLines = $state('');

	let reservationUnsubscribe: Unsubscribe | null = null;
	let guestUnsubscribe: Unsubscribe | null = null;

	function hydrateGuestForm(record: GuestRecord | null): void {
		if (!record) {
			return;
		}

		displayName = record.displayName;
		status = record.status === 'declined' ? 'declined' : 'accepted';
		plusOneLines = (record.plusOnes ?? []).map((item) => item.name).join('\n');
	}

	onMount(async () => {
		await waitForAuthReady();
		if (!reservationId) {
			loadingReservation = false;
			return;
		}

		reservationUnsubscribe = listenToReservationPublic(reservationId, (value) => {
			reservation = value;
			loadingReservation = false;
		});
	});

	$effect(() => {
		if (!$authReady || !$currentUser || !reservationId) {
			guest = null;
			if (guestUnsubscribe) {
				guestUnsubscribe();
				guestUnsubscribe = null;
			}
			return;
		}

		guestUnsubscribe = listenToGuest(reservationId, $currentUser.uid, (record) => {
			guest = record;
			hydrateGuestForm(record);
		});

		return () => {
			guestUnsubscribe?.();
			guestUnsubscribe = null;
		};
	});

	$effect(() => {
		if (debugAttempted || !reservation) {
			return;
		}

		const token = $page.url.searchParams.get('debug');
		if (!token || !$authReady || $currentUser) {
			return;
		}

		if (!reservation.debugEnabled) {
			debugMessage = 'Debug token ignored because this reservation was not created with debug enabled.';
			debugAttempted = true;
			return;
		}

		debugAttempted = true;
		void handleDebugToken(token);
	});

	onDestroy(() => {
		reservationUnsubscribe?.();
		guestUnsubscribe?.();
	});

	async function handleDebugToken(token: string): Promise<void> {
		if (!canUseDebugMode()) {
			debugMessage = 'Debug login bypass is disabled on this hostname.';
			return;
		}

		try {
			const isValid = await validateDebugToken(reservationId, token);
			if (!isValid) {
				debugMessage = 'Debug token was invalid.';
				return;
			}

			await signInAnonymouslyForDebug();
			pushToast({
				title: 'Debug access granted',
				description: 'Signed in without OTP for local testing.',
				variant: 'success'
			});
		} catch (error) {
			debugMessage = error instanceof Error ? error.message : 'Debug auth failed.';
		}
	}

	async function joinGuestlist(): Promise<void> {
		const destination = `${$page.url.pathname}${$page.url.search}`;
		if (!$currentUser) {
			await goto(`/login?returnTo=${encodeURIComponent(destination)}`);
			return;
		}

		if (!displayName) {
			displayName = $currentUser.displayName ?? '';
			if (!displayName && $currentUser.phoneNumber) {
				displayName = $currentUser.phoneNumber;
			}
		}
	}

	function parsePlusOnes(value: string): Array<{ name: string }> {
		return value
			.split('\n')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((name) => ({ name }));
	}

	async function submitRsvp(): Promise<void> {
		if (!$currentUser) {
			await joinGuestlist();
			return;
		}

		errorMessage = '';
		submitting = true;

		const payload: RsvpInput = {
			status,
			displayName: displayName.trim(),
			plusOnes: parsePlusOnes(plusOneLines)
		};

		const parsed = rsvpSchema.safeParse(payload);
		if (!parsed.success) {
			errorMessage = parsed.error.issues[0]?.message ?? 'Invalid RSVP payload.';
			submitting = false;
			return;
		}

		const previousGuest = guest;
		guest = {
			displayName: parsed.data.displayName,
			phone: $currentUser.phoneNumber ?? '',
			status: parsed.data.status,
			plusOnes: parsed.data.plusOnes,
			checkedInAt: null,
			checkedInBy: null,
			updatedAt: previousGuest?.updatedAt ?? Timestamp.now()
		};

		try {
			await upsertGuestRsvp(reservationId, $currentUser.uid, {
				...parsed.data,
				phone: $currentUser.phoneNumber ?? ''
			});
			pushToast({
				title: parsed.data.status === 'accepted' ? 'RSVP confirmed' : 'RSVP updated',
				description: 'Your response is synced.',
				variant: parsed.data.status === 'accepted' ? 'success' : 'default'
			});
		} catch (error) {
			guest = previousGuest;
			errorMessage = error instanceof Error ? error.message : 'Unable to save RSVP.';
		} finally {
			submitting = false;
		}
	}

	const spotsText = $derived(
		reservation ? `${reservation.acceptedCount}/${reservation.capacity} spots` : ''
	);
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-10">
	{#if loadingReservation}
		<Card>
			<CardContent class="p-6">
				<p class="text-sm text-muted-foreground">Loading reservation...</p>
			</CardContent>
		</Card>
	{:else if !reservation}
		<Card>
			<CardHeader>
				<CardTitle>Reservation not found</CardTitle>
				<CardDescription>The invite link may be invalid or expired.</CardDescription>
			</CardHeader>
			<CardContent>
				<a class={cn(buttonVariants({ variant: 'default', size: 'md' }))} href="/create">
					Create a new reservation
				</a>
			</CardContent>
		</Card>
	{:else}
		<section class="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
			<div class="space-y-6">
				<ReservationPreviewCard {reservation} />

				{#if debugMessage}
					<div class="rounded-2xl border border-border/80 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
						{debugMessage}
					</div>
				{/if}

				<Card>
					<CardHeader>
						<CardTitle>Join the guestlist</CardTitle>
						<CardDescription>
							Public details are visible before login. RSVP requires authentication.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						{#if !$currentUser}
							<p class="text-sm text-muted-foreground">
								Sign in with phone OTP to respond and reserve your spot.
							</p>
							<div class="flex flex-wrap gap-3">
								<Button onclick={joinGuestlist}>Join Guestlist</Button>
								<a
									class={cn(buttonVariants({ variant: 'outline', size: 'md' }))}
									href={`/login?returnTo=${encodeURIComponent(`${$page.url.pathname}${$page.url.search}`)}`}
								>
									Login
								</a>
							</div>
						{:else}
							<div class="space-y-2">
								<Label for="displayName">Display name</Label>
								<Input id="displayName" bind:value={displayName} placeholder="Your full name" />
							</div>

							<div class="grid gap-3 sm:grid-cols-2">
								<Button
									variant={status === 'accepted' ? 'success' : 'outline'}
									onclick={() => {
										status = 'accepted';
									}}
								>
									Accept
								</Button>
								<Button
									variant={status === 'declined' ? 'destructive' : 'outline'}
									onclick={() => {
										status = 'declined';
									}}
								>
									Decline
								</Button>
							</div>

							<div class="space-y-2">
								<Label for="plusOnes">Plus-ones (optional)</Label>
								<Textarea
									id="plusOnes"
									rows={4}
									bind:value={plusOneLines}
									placeholder="One name per line, max 4"
								/>
							</div>

							{#if errorMessage}
								<p class="rounded-2xl border border-destructive/35 bg-destructive/16 px-4 py-3 text-sm text-destructive-foreground">
									{errorMessage}
								</p>
							{/if}

							<Button onclick={submitRsvp} disabled={submitting}>
								{submitting ? 'Saving...' : 'Save RSVP'}
							</Button>
						{/if}

						{#if guest}
							<Separator class="my-2" />
							<div class="space-y-2 rounded-2xl border border-border/70 bg-secondary/25 p-4">
								<div class="flex flex-wrap items-center gap-2">
									<StatusChip status={guest.checkedInAt ? 'checked-in' : guest.status} />
									<span class="text-xs text-muted-foreground">Current state</span>
								</div>
								<p class="text-sm text-muted-foreground">
									{guest.status === 'accepted'
										? 'You are confirmed on the guestlist.'
										: 'Your response is saved.'}
								</p>
							</div>
						{/if}
					</CardContent>
				</Card>
			</div>

			<div class="space-y-4">
				<CapacityMeter
					capacity={reservation.capacity}
					accepted={reservation.acceptedCount}
					declined={reservation.declinedCount}
				/>

				<Card>
					<CardHeader>
						<CardTitle>Reservation snapshot</CardTitle>
					</CardHeader>
					<CardContent class="space-y-2 text-sm text-muted-foreground">
						<p>{spotsText}</p>
						<p>Table: {reservation.tableType}</p>
						<p>Guest link: {$page.url.pathname}</p>
					</CardContent>
				</Card>
			</div>
		</section>
	{/if}
</main>
