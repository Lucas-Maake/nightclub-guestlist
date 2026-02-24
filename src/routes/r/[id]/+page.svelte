<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { onDestroy, onMount } from 'svelte';
import { Timestamp, type Unsubscribe } from 'firebase/firestore';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import CapacityMeter from '$lib/components/common/capacity-meter.svelte';
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Badge } from '$lib/components/ui/badge';
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
	import { formatReservationDate } from '$lib/utils/format';
	import { inviteUrl } from '$lib/utils/links';
	import { canUseDebugMode } from '$lib/utils/security';

	const reservationId = $derived($page.params.id ?? '');

	let reservation = $state<ReservationPublicRecord | null>(null);
	let guest = $state<GuestRecord | null>(null);
	let loadingReservation = $state(true);
	let submitting = $state(false);
	let sharing = $state(false);
	let celebrateAccepted = $state(false);
	let debugMessage = $state('');
	let errorMessage = $state('');
	let debugAttempted = $state(false);

	let displayName = $state('');
	let status = $state<'accepted' | 'declined'>('accepted');
	let plusOneLines = $state('');

	let reservationUnsubscribe: Unsubscribe | null = null;
	let guestUnsubscribe: Unsubscribe | null = null;
	let celebrateTimer: ReturnType<typeof setTimeout> | null = null;

	function stableIndex(value: string, length: number): number {
		if (!value || length <= 0) {
			return 0;
		}

		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) | 0;
		}

		return Math.abs(hash) % length;
	}

	function triggerAcceptedCelebration(): void {
		celebrateAccepted = true;
		if (celebrateTimer) {
			clearTimeout(celebrateTimer);
		}
		celebrateTimer = setTimeout(() => {
			celebrateAccepted = false;
			celebrateTimer = null;
		}, 1100);
	}

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
		if (celebrateTimer) {
			clearTimeout(celebrateTimer);
			celebrateTimer = null;
		}
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
			if (parsed.data.status === 'accepted') {
				triggerAcceptedCelebration();
			}
		} catch (error) {
			guest = previousGuest;
			errorMessage = error instanceof Error ? error.message : 'Unable to save RSVP.';
		} finally {
			submitting = false;
		}
	}

	async function copyInviteLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(guestInviteLink);
			pushToast({
				title: 'Invite copied',
				description: guestInviteLink,
				variant: 'success'
			});
		} catch (error) {
			pushToast({
				title: 'Copy failed',
				description: error instanceof Error ? error.message : 'Clipboard unavailable.',
				variant: 'destructive'
			});
		}
	}

	async function shareInvite(): Promise<void> {
		if (!reservation) {
			return;
		}

		if (!canNativeShare) {
			await copyInviteLink();
			return;
		}

		sharing = true;
		try {
			await navigator.share({
				title: `${reservation.clubName} guest invite`,
				text: `Join us at ${reservation.clubName}.`,
				url: guestInviteLink
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}
			await copyInviteLink();
		} finally {
			sharing = false;
		}
	}

	const spotsText = $derived(
		reservation ? `${reservation.acceptedCount}/${reservation.capacity} spots` : ''
	);
	const startsAtText = $derived(
		reservation && reservation.startAt && 'toDate' in reservation.startAt
			? formatReservationDate(reservation.startAt.toDate())
			: ''
	);
	const guestInviteLink = $derived(reservationId ? inviteUrl(reservationId) : '');
	const canNativeShare = $derived(
		typeof navigator !== 'undefined' && typeof navigator.share === 'function'
	);
	const themeIndex = $derived(stableIndex(reservationId || reservation?.clubName || 'invite', 3));
	const vibeLabel = $derived(
		themeIndex === 0 ? 'Apollo Midnight' : themeIndex === 1 ? 'Neon Lounge' : 'Skyline Session'
	);
	const themeShellClass = $derived(
		themeIndex === 0
			? 'border-primary/35 bg-gradient-to-br from-primary/16 via-card/90 to-card'
			: themeIndex === 1
				? 'border-success/35 bg-gradient-to-br from-success/16 via-card/90 to-card'
				: 'border-sky-400/35 bg-gradient-to-br from-sky-400/16 via-card/90 to-card'
	);
	const themeBadgeClass = $derived(
		themeIndex === 0
			? 'border-primary/35 bg-primary/12 text-primary'
			: themeIndex === 1
				? 'border-success/35 bg-success/12 text-success-foreground'
				: 'border-sky-400/35 bg-sky-400/12 text-sky-100'
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
		<section class="motion-stagger grid gap-6 lg:grid-cols-[1.3fr_1fr]">
			<div class="space-y-6">
				<Card class={cn('overflow-hidden', themeShellClass)}>
					<CardContent class="space-y-6 p-6 sm:p-7">
						<div class="flex flex-wrap items-center gap-2">
							<Badge class={cn('border', themeBadgeClass)}>{vibeLabel}</Badge>
							<Badge variant="outline">Guestlist Live</Badge>
						</div>

						<div class="space-y-3">
							<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reservation Invite</p>
							<h1 class="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
								{reservation.clubName}
							</h1>
							<p class="text-sm text-muted-foreground sm:text-base">{reservation.notes}</p>
						</div>

						<div class="grid gap-3 sm:grid-cols-3">
							<div class="rounded-2xl border border-border/80 bg-secondary/30 p-4">
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Starts</p>
								<p class="mt-2 text-sm font-medium">{startsAtText}</p>
							</div>
							<div class="rounded-2xl border border-border/80 bg-secondary/30 p-4">
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Table</p>
								<p class="mt-2 text-sm font-medium">{reservation.tableType}</p>
							</div>
							<div class="rounded-2xl border border-border/80 bg-secondary/30 p-4">
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Capacity</p>
								<p class="mt-2 text-sm font-medium">{reservation.capacity} guests</p>
							</div>
						</div>

						{#if reservation.dressCode}
							<div class="rounded-2xl border border-border/80 bg-secondary/20 p-4">
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Dress code</p>
								<p class="mt-1 text-sm">{reservation.dressCode}</p>
							</div>
						{/if}
					</CardContent>
				</Card>

				{#if debugMessage}
					<div class="rounded-2xl border border-border/80 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
						{debugMessage}
					</div>
				{/if}

				<Card>
					<CardHeader>
						<CardTitle>Join the guestlist</CardTitle>
						<CardDescription>
							Public details are visible before login. RSVP requires authentication and syncs instantly.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="rounded-2xl border border-border/80 bg-secondary/20 p-4">
							<p class="text-xs uppercase tracking-wide text-muted-foreground">Share invite</p>
							<p class="mt-2 text-xs text-muted-foreground">
								{canNativeShare
									? 'On mobile, share opens your native share sheet.'
									: 'Native share is unavailable on this browser, so copy link is used.'}
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<Button size="sm" onclick={shareInvite} disabled={sharing}>
									{sharing ? 'Opening...' : canNativeShare ? 'Share invite' : 'Copy invite link'}
								</Button>
								<Button size="sm" variant="outline" onclick={copyInviteLink}>Copy link</Button>
							</div>
						</div>

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
								<button
									type="button"
									aria-pressed={status === 'accepted'}
									class={cn(
										'rounded-2xl border p-4 text-left transition-colors',
										status === 'accepted'
											? 'border-success/45 bg-success/15'
											: 'border-border/80 bg-secondary/20 hover:bg-secondary/35'
									)}
									onclick={() => {
										status = 'accepted';
									}}
								>
									<p class="text-sm font-semibold">I&apos;m in</p>
									<p class="mt-1 text-xs text-muted-foreground">
										Keep me on the list and hold my spot.
									</p>
								</button>
								<button
									type="button"
									aria-pressed={status === 'declined'}
									class={cn(
										'rounded-2xl border p-4 text-left transition-colors',
										status === 'declined'
											? 'border-destructive/45 bg-destructive/14'
											: 'border-border/80 bg-secondary/20 hover:bg-secondary/35'
									)}
									onclick={() => {
										status = 'declined';
									}}
								>
									<p class="text-sm font-semibold">Can&apos;t make it</p>
									<p class="mt-1 text-xs text-muted-foreground">
										Free up capacity and update your RSVP.
									</p>
								</button>
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

							<div class="relative inline-flex">
								<Button onclick={submitRsvp} disabled={submitting} class="relative z-10">
									{submitting ? 'Saving...' : 'Save RSVP'}
								</Button>
								{#if celebrateAccepted}
									<span class="pointer-events-none absolute -inset-3 rounded-pill border border-success/45 animate-ping"></span>
									<span class="pointer-events-none absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-pill bg-success/70 motion-enter"></span>
									<span
										class="pointer-events-none absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-pill bg-primary/70 motion-enter"
										style="animation-delay: 90ms"
									></span>
									<span
										class="pointer-events-none absolute left-1/2 -top-1 h-2 w-2 -translate-x-1/2 rounded-pill bg-success/75 motion-enter"
										style="animation-delay: 140ms"
									></span>
								{/if}
							</div>
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
					<CardContent class="space-y-4 text-sm text-muted-foreground">
						<div class="space-y-2">
							<p>{spotsText}</p>
							<p>Table: {reservation.tableType}</p>
						</div>
						<div class="rounded-2xl border border-border/75 bg-secondary/20 p-3">
							<p class="text-xs uppercase tracking-wide text-muted-foreground">Guest link</p>
							<p class="mt-2 break-all text-xs">{guestInviteLink}</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</section>
	{/if}
</main>
