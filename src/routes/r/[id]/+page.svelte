<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { Timestamp, type Unsubscribe } from 'firebase/firestore';
	import { ChevronDown } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import CapacityMeter from '$lib/components/common/capacity-meter.svelte';
	import StatusChip from '$lib/components/common/status-chip.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input, Label } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rsvpSchema } from '$lib/schemas/reservation';
	import { authReady, currentUser, signInAnonymouslyForDebug, waitForAuthReady } from '$lib/firebase/auth';
	import {
		isCommentRateLimitedError,
		isHostForReservation,
		listenToGuest,
		listenToPublicAttendees,
		listenToReservationComments,
		listenToReservationPublic,
		listenToWaitlistRequest,
		postReservationComment,
		upsertWaitlistRequest,
		upsertGuestRsvp,
		validateDebugToken
	} from '$lib/firebase/firestore';
	import type {
		GuestRecord,
		PublicAttendeeRecord,
		ReservationCommentRecord,
		ReservationPublicRecord,
		RsvpInput
	} from '$lib/types/models';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { cn } from '$lib/utils/cn';
	import { formatLastUpdated, formatReservationDate } from '$lib/utils/format';
	import { toUserSafeRsvpMessage } from '$lib/utils/messages';
	import { canUseDebugMode, isProductionLikeRuntime } from '$lib/utils/security';

	const reservationId = $derived($page.params.id ?? '');
	const productionLike = isProductionLikeRuntime();
	const timelineTimeFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		hour: 'numeric',
		minute: '2-digit'
	});
	const commentTimeFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
	const maxCommentLength = 280;

	let reservation = $state<ReservationPublicRecord | null>(null);
	let guest = $state<GuestRecord | null>(null);
	let publicAttendees = $state<Array<PublicAttendeeRecord & { uid: string }>>([]);
	let loadingReservation = $state(true);
	let submitting = $state(false);
	let hostViewOnly = $state(false);
	let hostRoleChecking = $state(true);
	let celebrateAccepted = $state(false);
	let guestListDialogOpen = $state(false);
	let debugMessage = $state('');
	let errorMessage = $state('');
	let debugAttempted = $state(false);
	let waitlistJoined = $state(false);
	let waitlistSubmitting = $state(false);
	let waitlistError = $state('');
	let comments = $state<Array<ReservationCommentRecord & { id: string }>>([]);
	let loadingComments = $state(false);
	let postingComment = $state(false);
	let commentDraft = $state('');
	let commentError = $state('');

	let displayName = $state('');
	let status = $state<'accepted' | 'declined'>('accepted');
	let plusOneLines = $state('');

	// Derived: parsed plus-ones for live feedback
	const parsedPlusOnes = $derived.by(() => {
		if ((reservation?.plusOnesEnabled ?? true) === false) {
			return [];
		}

		return plusOneLines
			.split('\n')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.slice(0, 4);
	});

	// Clear errors when user interacts with form
	function clearFormErrors() {
		errorMessage = '';
		waitlistError = '';
	}

	let reservationUnsubscribe: Unsubscribe | null = null;
	let guestUnsubscribe: Unsubscribe | null = null;
	let attendeesUnsubscribe: Unsubscribe | null = null;
	let waitlistUnsubscribe: Unsubscribe | null = null;
	let commentsUnsubscribe: Unsubscribe | null = null;
	let celebrateTimer: ReturnType<typeof setTimeout> | null = null;
	let nowMs = $state(Date.now());
	let countdownTicker: ReturnType<typeof setInterval> | null = null;

	const faqItems = [
		{
			id: 'id',
			question: 'Do I need ID at the door?',
			answer: 'Bring a valid government-issued photo ID. Venue entry rules still apply.'
		},
		{
			id: 'plus-ones',
			question: 'Can I bring plus-ones?',
			answer: 'Yes. Add plus-one names before you save RSVP so entry and capacity stay accurate.'
		},
		{
			id: 'arrival',
			question: 'When should I arrive?',
			answer:
				'Aim for your listed start time. Arriving much later can affect entry priority during peak hours.'
		}
	] as const;

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

	onMount(() => {
		nowMs = Date.now();
		countdownTicker = setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		return () => {
			if (countdownTicker) {
				clearInterval(countdownTicker);
				countdownTicker = null;
			}
		};
	});

	$effect(() => {
		if (!$authReady || !$currentUser || !reservationId || hostViewOnly || hostRoleChecking) {
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
		if (!$authReady || !$currentUser || !reservationId || hostViewOnly || hostRoleChecking) {
			waitlistJoined = false;
			waitlistError = '';
			if (waitlistUnsubscribe) {
				waitlistUnsubscribe();
				waitlistUnsubscribe = null;
			}
			return;
		}

		waitlistUnsubscribe = listenToWaitlistRequest(reservationId, $currentUser.uid, (record) => {
			waitlistJoined = Boolean(record);
		});

		return () => {
			waitlistUnsubscribe?.();
			waitlistUnsubscribe = null;
		};
	});

	$effect(() => {
		if (!$authReady) {
			hostViewOnly = false;
			hostRoleChecking = true;
			return;
		}

		if (!$currentUser || !reservationId) {
			hostViewOnly = false;
			hostRoleChecking = false;
			return;
		}

		let cancelled = false;
		hostRoleChecking = true;
		void (async () => {
			const isHost = await isHostForReservation(reservationId, $currentUser.uid);
			if (!cancelled) {
				hostViewOnly = isHost;
				if (isHost) {
					guest = null;
					errorMessage = '';
				}
				hostRoleChecking = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const visibility = reservation?.guestListVisibility ?? 'hidden';
		if (!reservationId || visibility !== 'visible') {
			publicAttendees = [];
			if (attendeesUnsubscribe) {
				attendeesUnsubscribe();
				attendeesUnsubscribe = null;
			}
			return;
		}

		attendeesUnsubscribe = listenToPublicAttendees(reservationId, (records) => {
			publicAttendees = records.filter((record) => record.status === 'accepted');
		});

		return () => {
			attendeesUnsubscribe?.();
			attendeesUnsubscribe = null;
		};
	});

	$effect(() => {
		if (!reservationId) {
			comments = [];
			loadingComments = false;
			commentDraft = '';
			commentError = '';
			commentsUnsubscribe?.();
			commentsUnsubscribe = null;
			return;
		}

		comments = [];
		loadingComments = true;
		commentError = '';
		commentsUnsubscribe?.();
		commentsUnsubscribe = listenToReservationComments(reservationId, (value) => {
			comments = value;
			loadingComments = false;
		});

		return () => {
			commentsUnsubscribe?.();
			commentsUnsubscribe = null;
		};
	});

	$effect(() => {
		if ((reservation?.plusOnesEnabled ?? true) === false && plusOneLines.length > 0) {
			plusOneLines = '';
		}
	});

	$effect(() => {
		if (debugAttempted || !reservation) {
			return;
		}

		const token = $page.url.searchParams.get('debug');
		if (!token || !$authReady || $currentUser) {
			return;
		}

		if (productionLike) {
			debugAttempted = true;
			return;
		}

		if (!reservation.debugEnabled) {
			debugMessage = 'This test link is not available for this invite.';
			debugAttempted = true;
			return;
		}

		debugAttempted = true;
		void handleDebugToken(token);
	});

	onDestroy(() => {
		reservationUnsubscribe?.();
		guestUnsubscribe?.();
		attendeesUnsubscribe?.();
		waitlistUnsubscribe?.();
		commentsUnsubscribe?.();
		if (countdownTicker) {
			clearInterval(countdownTicker);
			countdownTicker = null;
		}
		if (celebrateTimer) {
			clearTimeout(celebrateTimer);
			celebrateTimer = null;
		}
	});

	function formatCountdownDuration(milliseconds: number): string {
		const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
		const days = Math.floor(totalSeconds / 86400);
		const hours = Math.floor((totalSeconds % 86400) / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (days > 0) {
			return `${days}d ${hours}h ${minutes}m`;
		}

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}

		if (minutes > 0) {
			return `${minutes}m ${seconds}s`;
		}

		return `${seconds}s`;
	}

	function initials(value: string): string {
		const parts = value
			.split(/\s+/)
			.map((part) => part.trim())
			.filter(Boolean)
			.slice(0, 2);

		if (parts.length === 0) {
			return 'HT';
		}

		return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
	}

	function formatCommentTime(value: ReservationCommentRecord['createdAt']): string {
		return commentTimeFormatter.format(value.toDate());
	}

	function commenterName(): string {
		const currentName = $currentUser?.displayName?.trim();
		if (currentName) {
			return currentName.slice(0, 48);
		}

		const typedName = displayName.trim();
		if (typedName) {
			return typedName.slice(0, 48);
		}

		const digits = ($currentUser?.phoneNumber ?? '').replace(/\D/g, '');
		if (digits.length >= 4) {
			return `Guest ${digits.slice(-4)}`;
		}

		return 'Guest';
	}

	async function handleDebugToken(token: string): Promise<void> {
		if (productionLike) {
			return;
		}

		if (!canUseDebugMode()) {
			debugMessage = 'This test link only works on local test hosts.';
			return;
		}

		try {
			const isValid = await validateDebugToken(reservationId, token);
			if (!isValid) {
				debugMessage = 'This test link is invalid or expired.';
				return;
			}

			await signInAnonymouslyForDebug();
			pushToast({
				title: 'Test access enabled',
				description: 'Signed in for local testing.',
				variant: 'success'
			});
		} catch (error) {
			void error;
			debugMessage = 'Could not open this test link right now.';
		}
	}

	async function joinGuestlist(): Promise<boolean> {
		const destination = `${$page.url.pathname}${$page.url.search}`;
		if (!$currentUser) {
			const authResult = await openAuthModal({ returnTo: destination, source: 'guest-join' });
			if (authResult !== 'authenticated') {
				errorMessage = 'Sign in is required to save your RSVP.';
				return false;
			}

			await waitForAuthReady();
			if (!$currentUser) {
				errorMessage = 'Sign in is required to save your RSVP.';
				return false;
			}
		}
		errorMessage = '';

		if (!displayName) {
			displayName = $currentUser.displayName ?? '';
			if (!displayName && $currentUser.phoneNumber) {
				displayName = $currentUser.phoneNumber;
			}
		}

		return true;
	}

	async function openGuestSignIn(): Promise<void> {
		const destination = `${$page.url.pathname}${$page.url.search}`;
		const authResult = await openAuthModal({ returnTo: destination, source: 'guest-signin' });
		if (authResult !== 'authenticated') {
			errorMessage = 'Sign in is required to save your RSVP.';
			return;
		}
		errorMessage = '';
	}

	function parsePlusOnes(value: string): Array<{ name: string }> {
		return value
			.split('\n')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((name) => ({ name }));
	}

	async function submitRsvp(): Promise<void> {
		if (hostViewOnly) {
			errorMessage = 'Hosts cannot RSVP from the guest page.';
			return;
		}

		if (!$currentUser) {
			const joined = await joinGuestlist();
			if (!joined) {
				return;
			}
			return;
		}

		errorMessage = '';
		submitting = true;

		const payload: RsvpInput = {
			status,
			displayName: displayName.trim(),
			plusOnes: (reservation?.plusOnesEnabled ?? true) ? parsePlusOnes(plusOneLines) : []
		};

		const parsed = rsvpSchema.safeParse(payload);
		if (!parsed.success) {
			errorMessage = parsed.error.issues[0]?.message ?? 'Please review your RSVP details and try again.';
			submitting = false;
			return;
		}

		if (parsed.data.status === 'accepted' && blocksNewAcceptance) {
			errorMessage = 'This guest list is full right now. You can still choose "Can\'t make it".';
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
			errorMessage = toUserSafeRsvpMessage(error, productionLike);
		} finally {
			submitting = false;
		}
	}

	async function joinWaitlist(): Promise<void> {
		if (hostViewOnly) {
			waitlistError = 'Hosts cannot join the waitlist from this page.';
			return;
		}

		if (!$currentUser) {
			await joinGuestlist();
			if (!$currentUser) {
				waitlistError = 'Sign in is required to join the waitlist.';
				return;
			}
		}

		const payload: RsvpInput = {
			status: 'declined',
			displayName: displayName.trim(),
			plusOnes: (reservation?.plusOnesEnabled ?? true) ? parsePlusOnes(plusOneLines) : []
		};

		const parsed = rsvpSchema.safeParse(payload);
		if (!parsed.success) {
			waitlistError = parsed.error.issues[0]?.message ?? 'Please review your details and try again.';
			return;
		}

		waitlistSubmitting = true;
		waitlistError = '';
		try {
			await upsertWaitlistRequest(reservationId, $currentUser.uid, {
				displayName: parsed.data.displayName,
				phone: $currentUser.phoneNumber ?? '',
				plusOnes: parsed.data.plusOnes
			});
			pushToast({
				title: waitlistJoined ? 'Waitlist updated' : 'Joined waitlist',
				description: 'You will stay on standby if a spot opens.',
				variant: 'success'
			});
		} catch {
			waitlistError = 'We could not save your waitlist request right now. Please try again.';
		} finally {
			waitlistSubmitting = false;
		}
	}

	async function handlePostComment(): Promise<void> {
		if (!reservationId || postingComment) {
			return;
		}

		const text = commentDraft.trim().slice(0, maxCommentLength);
		if (!text) {
			commentError = 'Write a quick update before posting.';
			return;
		}

		if (!$currentUser) {
			const destination = `${$page.url.pathname}${$page.url.search}`;
			const authResult = await openAuthModal({ returnTo: destination, source: 'guest-comment' });
			if (authResult !== 'authenticated') {
				return;
			}
		}

		const uid = $currentUser?.uid;
		if (!uid) {
			commentError = 'Sign in to post updates.';
			return;
		}

		postingComment = true;
		commentError = '';
		try {
			await postReservationComment(reservationId, uid, {
				displayName: commenterName(),
				text
			});
			commentDraft = '';
			pushToast({
				title: 'Update posted',
				description: 'Your comment is now visible on this invite.',
				variant: 'success'
			});
		} catch (error) {
			if (isCommentRateLimitedError(error)) {
				commentError = "You're posting too quickly. Please wait a bit before commenting again.";
			} else {
				commentError = 'Could not post your update right now. Please try again.';
			}
		} finally {
			postingComment = false;
		}
	}

	const spotsRemaining = $derived(
		reservation ? Math.max(0, reservation.capacity - reservation.claimedCount) : 0
	);
	const lowSpotsWarning = $derived(spotsRemaining > 0 && spotsRemaining <= 3);
	const startsAtText = $derived(
		reservation && reservation.startAt && 'toDate' in reservation.startAt
			? formatReservationDate(reservation.startAt.toDate())
			: ''
	);
	const startDate = $derived(
		reservation && reservation.startAt && 'toDate' in reservation.startAt
			? reservation.startAt.toDate()
			: null
	);
	const startMs = $derived(startDate ? startDate.getTime() : null);
	const eventState = $derived.by(() => {
		if (!startMs) {
			return 'scheduled';
		}

		const diff = startMs - nowMs;
		if (diff > 0) {
			return 'upcoming';
		}

		if (diff >= -4 * 60 * 60 * 1000) {
			return 'live';
		}

		return 'past';
	});
	const countdownHeadline = $derived.by(() => {
		if (!startMs) {
			return 'Schedule pending';
		}

		const diff = startMs - nowMs;
		if (diff > 0) {
			return `Starts in ${formatCountdownDuration(diff)}`;
		}

		if (diff >= -4 * 60 * 60 * 1000) {
			return 'Live now';
		}

		return `Started ${formatCountdownDuration(-diff)} ago`;
	});
	const countdownSubline = $derived.by(() => {
		if (!startDate) {
			return 'Start time will appear once confirmed.';
		}

		if (eventState === 'upcoming') {
			return `Doors open ${timelineTimeFormatter.format(startDate)}`;
		}

		if (eventState === 'live') {
			return 'Doors are currently open.';
		}

		return 'Event has already started.';
	});
	const hostName = $derived(reservation ? `${reservation.clubName} host team` : 'Host team');
	const hostInitials = $derived(initials(hostName));
	const hostWelcome = $derived(
		reservation
			? `Welcome in. Keep your RSVP updated so your spot and plus-ones stay locked.`
			: ''
	);
	const isCapacityFull = $derived(
		reservation ? reservation.claimedCount >= reservation.capacity : false
	);
	const plusOnesEnabled = $derived((reservation?.plusOnesEnabled ?? true) === true);
	const isCurrentlyAccepted = $derived(guest?.status === 'accepted');
	const blocksNewAcceptance = $derived(isCapacityFull && !isCurrentlyAccepted);
	const publicGuestListVisible = $derived((reservation?.guestListVisibility ?? 'hidden') === 'visible');
	const guestLastUpdated = $derived(
		guest?.updatedAt && 'toDate' in guest.updatedAt ? formatLastUpdated(guest.updatedAt.toDate()) : ''
	);
	const themeIndex = $derived(stableIndex(reservationId || reservation?.clubName || 'invite', 3));
	const themeShellClass = $derived(
		themeIndex === 0
			? 'border-primary/35 bg-gradient-to-br from-primary/16 via-card/90 to-card'
			: themeIndex === 1
				? 'border-success/35 bg-gradient-to-br from-success/16 via-card/90 to-card'
				: 'border-sky-400/35 bg-gradient-to-br from-sky-400/16 via-card/90 to-card'
	);
	const heroPosterClass = $derived(
		themeIndex === 0
			? 'bg-[radial-gradient(circle_at_16%_18%,rgba(59,130,246,0.45),transparent_40%),radial-gradient(circle_at_84%_10%,rgba(16,185,129,0.3),transparent_36%),linear-gradient(160deg,#050911_0%,#0a1326_55%,#030712_100%)]'
			: themeIndex === 1
				? 'bg-[radial-gradient(circle_at_14%_22%,rgba(34,197,94,0.42),transparent_42%),radial-gradient(circle_at_84%_14%,rgba(250,204,21,0.26),transparent_36%),linear-gradient(165deg,#07120d_0%,#122318_55%,#030a06_100%)]'
				: 'bg-[radial-gradient(circle_at_18%_20%,rgba(14,165,233,0.4),transparent_40%),radial-gradient(circle_at_84%_8%,rgba(168,85,247,0.28),transparent_38%),linear-gradient(158deg,#05111a_0%,#102438_55%,#03080f_100%)]'
	);
</script>

<AppHeader />

<main class="app-shell pb-24 pt-6 sm:pb-28 sm:pt-10">
	{#if loadingReservation}
		<Card>
			<CardContent class="p-6">
				<p class="state-panel-muted" aria-live="polite">Loading reservation...</p>
			</CardContent>
		</Card>
	{:else if !reservation}
		<Card>
			<CardHeader>
				<CardTitle>Reservation not found</CardTitle>
				<CardDescription>
					This invite may be invalid, expired, or removed by the host.
				</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-wrap gap-3">
				<a class={cn(buttonVariants({ variant: 'outline', size: 'md' }))} href="/">Back to home</a>
			</CardContent>
		</Card>
	{:else}
		<section class="motion-stagger grid gap-6 lg:grid-cols-[1.3fr_1fr]">
			<div class="space-y-6">
				<Card class={cn('overflow-hidden', themeShellClass)}>
					<CardContent class="space-y-6 p-6 sm:p-7">
						<div
							class={cn(
								'relative min-h-[220px] overflow-hidden rounded-2xl border border-primary/20 p-5 sm:min-h-[260px] sm:p-6',
								heroPosterClass
							)}
						>
							<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/72"></div>
							<div class="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-pill bg-white/12 blur-[60px]"></div>
							<div class="pointer-events-none absolute -right-10 bottom-0 h-52 w-52 rounded-pill bg-primary/30 blur-[70px]"></div>
							<div class="relative z-10 flex h-full flex-col justify-end gap-2">
								<p class="text-xs uppercase tracking-[0.2em] text-white/82">Guest invite</p>
								<h2 class="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
									{reservation.clubName}
								</h2>
								<p class="text-sm text-white/80">{startsAtText || 'Date pending'}</p>
							</div>
						</div>

						<div class="space-y-3">
							<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Invite details</p>
							<p class="text-sm text-muted-foreground sm:text-base">{reservation.notes}</p>
						</div>

						<div class="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
							<div
								class={cn(
									'rounded-2xl border bg-secondary/25 p-4 backdrop-blur-sm transition-all',
									eventState === 'live'
										? 'border-success/40 shadow-[0_0_25px_hsl(150_80%_45%/0.2)]'
										: 'border-border/80'
								)}
							>
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Countdown</p>
								<p class={cn('mt-2 text-lg font-semibold', eventState === 'live' ? 'text-glow-success text-success-foreground' : 'text-foreground')}>
									{countdownHeadline}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">{countdownSubline}</p>
							</div>
							<div class="rounded-2xl border border-border/80 bg-secondary/25 p-4">
								<div class="flex items-center gap-3">
									<span class="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-primary/35 bg-primary/15 text-sm font-semibold text-primary">
										{hostInitials}
									</span>
									<div class="min-w-0">
										<p class="text-xs uppercase tracking-wide text-muted-foreground">Hosted by</p>
										<p class="truncate text-sm font-medium text-foreground">{hostName}</p>
									</div>
								</div>
								<p class="mt-3 text-xs text-muted-foreground">{hostWelcome}</p>
							</div>
						</div>

						<div class="rounded-2xl border border-border/80 bg-secondary/30 p-4">
							<p class="text-xs uppercase tracking-wide text-muted-foreground">Table</p>
							<p class="mt-2 text-sm font-medium">{reservation.tableType}</p>
						</div>
					</CardContent>
				</Card>

				{#if !productionLike && debugMessage}
					<div class="state-panel-muted">
						{debugMessage}
					</div>
				{/if}

				<Card>
					<CardHeader>
						<CardTitle>Join the guestlist</CardTitle>
					</CardHeader>
					<CardContent class="space-y-4">
						{#if lowSpotsWarning}
							<div class="rounded-2xl border border-primary/35 bg-primary/12 px-4 py-3 text-sm text-primary-foreground">
								Only {spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} left.
							</div>
						{/if}

						{#if !$currentUser}
							<p class="text-sm text-muted-foreground">
								Sign in with phone verification to respond and reserve your spot.
							</p>
							{#if errorMessage}
								<p class="state-panel-error text-sm" aria-live="polite">{errorMessage}</p>
							{/if}
							<div class="flex flex-wrap gap-3">
								<Button onclick={joinGuestlist}>Join Guestlist</Button>
								<button
									type="button"
									class={cn(buttonVariants({ variant: 'outline', size: 'md' }))}
									onclick={openGuestSignIn}
								>
									Sign in
								</button>
							</div>
						{:else if hostRoleChecking}
							<p class="state-panel-muted" aria-live="polite">Checking your access...</p>
						{:else if hostViewOnly}
							<div class="space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
								<p class="text-sm font-medium text-foreground">Host preview mode</p>
								<p class="text-sm text-muted-foreground">
									Hosts can view this guest page, but RSVP actions are disabled.
								</p>
								<div class="flex flex-wrap gap-2">
									<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/r/${reservationId}/host`}>
										Open host hub
									</a>
									<a class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))} href={`/r/${reservationId}/checkin`}>
										Open check-in
									</a>
								</div>
							</div>
						{:else}
							<div class="space-y-2">
								<Label for="displayName">Display name</Label>
								<Input
									id="displayName"
									bind:value={displayName}
									placeholder="Your full name"
									oninput={clearFormErrors}
								/>
								<p class="text-xs text-muted-foreground">This name appears on the guest list</p>
							</div>

							{#if blocksNewAcceptance}
								<div class="space-y-3 rounded-2xl border border-destructive/35 bg-destructive/12 p-4">
									<p class="text-sm font-medium text-destructive-foreground">
										This guest list is full right now.
									</p>
									<p class="text-xs text-muted-foreground">
										Join the waitlist to stay on standby if a spot opens.
									</p>
									<Button
										size="sm"
										variant={waitlistJoined ? 'success' : 'outline'}
										onclick={joinWaitlist}
										disabled={waitlistSubmitting}
									>
										{waitlistSubmitting
											? 'Saving...'
											: waitlistJoined
												? 'On waitlist'
												: 'Join waitlist'}
									</Button>
									{#if waitlistError}
										<p class="text-xs text-destructive-foreground">{waitlistError}</p>
									{/if}
								</div>
							{/if}

							<div class="grid gap-3 sm:grid-cols-2">
								<button
									type="button"
									aria-pressed={status === 'accepted'}
									disabled={blocksNewAcceptance}
									class={cn(
										'rounded-2xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60',
										status === 'accepted'
											? 'border-success/50 bg-success/18 shadow-[0_0_20px_hsl(150_80%_45%/0.15)]'
											: 'border-border/80 bg-secondary/20 hover:bg-secondary/35 hover:border-primary/25'
									)}
									onclick={() => {
										status = 'accepted';
										clearFormErrors();
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
										'rounded-2xl border p-4 text-left transition-all duration-200',
										status === 'declined'
											? 'border-destructive/45 bg-destructive/14'
											: 'border-border/80 bg-secondary/20 hover:bg-secondary/35 hover:border-primary/25'
									)}
									onclick={() => {
										status = 'declined';
										clearFormErrors();
									}}
								>
									<p class="text-sm font-semibold">Can&apos;t make it</p>
									<p class="mt-1 text-xs text-muted-foreground">
										Free up capacity and update your RSVP.
									</p>
								</button>
							</div>

							{#if plusOnesEnabled}
								<div class="space-y-2">
									<div class="flex items-baseline justify-between gap-2">
										<Label for="plusOnes">Plus-ones (optional)</Label>
										<span class="text-xs text-muted-foreground">{parsedPlusOnes.length}/4</span>
									</div>
									<Textarea
										id="plusOnes"
										rows={4}
										bind:value={plusOneLines}
										placeholder="One name per line, max 4"
										oninput={clearFormErrors}
									/>
									{#if parsedPlusOnes.length > 0}
										<p class="text-xs text-muted-foreground">
											Adding: {parsedPlusOnes.join(', ')}
										</p>
									{/if}
								</div>
							{:else}
								<p class="text-xs text-muted-foreground">
									The host has disabled plus-ones for this invite.
								</p>
							{/if}

							{#if errorMessage}
								<p class="state-panel-error" aria-live="polite">
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
							<div class="space-y-3 rounded-2xl border border-border/70 bg-secondary/25 p-4">
								<div class="flex flex-wrap items-center gap-2">
									<StatusChip status={guest.checkedInAt ? 'checked-in' : guest.status} />
									<span class="text-xs text-muted-foreground">Saved response</span>
								</div>
								<p class="text-sm font-medium text-foreground">
									{guest.status === 'accepted'
										? 'You already responded: Accepted'
										: 'You already responded: Declined'}
								</p>
								{#if guestLastUpdated}
									<p class="text-xs text-muted-foreground">{guestLastUpdated}</p>
								{/if}
								<p class="text-xs text-muted-foreground">
									Need to change your response? Edit the fields above and save again.
								</p>
							</div>
						{/if}
					</CardContent>
				</Card>
			</div>

			<div class="space-y-4">
				<CapacityMeter
					capacity={reservation.capacity}
					accepted={reservation.claimedCount}
					declined={reservation.declinedCount}
				/>

				<Card>
					<CardHeader>
						<CardTitle>Activity</CardTitle>
						<CardDescription>Live updates and comments for this invite.</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						{#if loadingComments}
							<div class="state-panel-muted">Loading updates...</div>
						{:else if comments.length === 0}
							<div class="state-panel-muted">No updates yet. Be the first to post.</div>
						{:else}
							<div class="space-y-2">
								{#each comments as comment (comment.id)}
									<div class="rounded-xl border border-border/80 bg-secondary/20 px-3 py-2">
										<div class="flex items-center justify-between gap-2">
											<p class="text-xs font-semibold text-foreground">{comment.displayName}</p>
											<p class="text-xs text-muted-foreground">{formatCommentTime(comment.createdAt)}</p>
										</div>
										<p class="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
											{comment.text}
										</p>
									</div>
								{/each}
							</div>
						{/if}

						<div class="space-y-2 rounded-2xl border border-border/80 bg-secondary/20 p-3">
							<p class="text-xs text-muted-foreground">Share a quick update or comment.</p>
							<Textarea
								rows={3}
								placeholder="Set times changed, line is moving fast, dress code reminder..."
								bind:value={commentDraft}
								maxlength={maxCommentLength}
								disabled={postingComment}
								oninput={() => { commentError = ''; }}
							/>
							<div class="flex items-center justify-between gap-3">
								<p class="text-xs text-muted-foreground">{commentDraft.trim().length}/{maxCommentLength}</p>
								{#if $currentUser}
									<Button
										size="sm"
										onclick={handlePostComment}
										disabled={postingComment || commentDraft.trim().length === 0}
									>
										{postingComment ? 'Posting...' : 'Post update'}
									</Button>
								{:else}
									<Button size="sm" variant="outline" onclick={openGuestSignIn}>Sign in to comment</Button>
								{/if}
							</div>
							{#if commentError}
								<p class="text-xs text-destructive-foreground">{commentError}</p>
							{/if}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>FAQ</CardTitle>
						<CardDescription>Quick answers before you RSVP.</CardDescription>
					</CardHeader>
					<CardContent class="space-y-2">
						{#each faqItems as item (item.id)}
							<details class="group rounded-2xl border border-border/75 bg-secondary/20">
								<summary class="faq-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
									<span>{item.question}</span>
									<span class="inline-flex h-6 w-6 items-center justify-center rounded-pill border border-border/80 bg-background/30 text-muted-foreground">
										<ChevronDown class="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
									</span>
								</summary>
								<p class="px-4 pb-4 text-sm text-muted-foreground">{item.answer}</p>
							</details>
						{/each}
					</CardContent>
				</Card>

				{#if publicGuestListVisible}
					<Card>
						<CardHeader>
							<div class="flex items-center justify-between gap-3">
								<CardTitle>Who&apos;s going</CardTitle>
								{#if publicAttendees.length > 0}
									<Button
										size="sm"
										variant="ghost"
										onclick={() => {
											guestListDialogOpen = true;
										}}
									>
										View all
									</Button>
								{/if}
							</div>
							<CardDescription>Accepted attendees shown in first-name format.</CardDescription>
						</CardHeader>
						<CardContent>
							{#if publicAttendees.length === 0}
								<div class="state-panel-muted" aria-live="polite">
									No accepted guests yet. Check back once more responses come in.
								</div>
							{:else}
								<div class="grid gap-2">
									{#each publicAttendees as attendee (attendee.uid)}
										<p class="rounded-2xl border border-border/70 bg-secondary/20 px-3 py-2 text-sm">
											{attendee.namePublic}
										</p>
									{/each}
								</div>
							{/if}
						</CardContent>
					</Card>
				{/if}
			</div>
		</section>
	{/if}
</main>

{#if reservation && !hostViewOnly}
	<div class="fixed inset-x-0 bottom-0 z-40 border-t border-primary/15 bg-background/85 backdrop-blur-xl">
		<div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
		<div class="app-shell py-3">
			<div class="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
				<div class="min-w-0">
					{#if isCapacityFull}
						<p class="text-sm font-medium text-destructive-foreground">
							{waitlistJoined ? 'You are on the waitlist' : 'Guest list is currently full'}
						</p>
					{:else}
						<p class="text-sm font-medium text-foreground">
							{spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} left
						</p>
					{/if}
					<p class="text-xs text-muted-foreground">
						{$currentUser ? 'Update your RSVP any time.' : 'Sign in to respond and save your spot.'}
					</p>
				</div>
				{#if !$currentUser}
					<Button size="sm" onclick={joinGuestlist}>Join Guestlist</Button>
				{:else}
					<Button size="sm" onclick={submitRsvp} disabled={submitting || hostRoleChecking}>
						{submitting ? 'Saving...' : guest ? 'Update RSVP' : 'Save RSVP'}
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.faq-summary::-webkit-details-marker) {
		display: none;
	}
</style>

<Dialog
	open={guestListDialogOpen}
	on:openChange={(event) => {
		guestListDialogOpen = event.detail;
	}}
>
	<DialogHeader>
		<DialogTitle>Guest list</DialogTitle>
		<DialogDescription>
			Accepted attendees shown in first-name format.
		</DialogDescription>
	</DialogHeader>
	<div class="mt-4 space-y-2">
		{#if publicAttendees.length === 0}
			<div class="state-panel-muted">No accepted guests to show yet.</div>
		{:else}
			{#each publicAttendees as attendee (attendee.uid)}
				<p class="rounded-2xl border border-border/70 bg-secondary/25 px-3 py-2 text-sm">
					{attendee.namePublic}
				</p>
			{/each}
		{/if}
	</div>
</Dialog>
