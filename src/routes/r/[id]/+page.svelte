<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { Timestamp, type Unsubscribe } from 'firebase/firestore';
	import { Calendar, Clock3, MapPin, Sparkles, Users, X } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input, Label } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rsvpSchema } from '$lib/schemas/reservation';
	import {
		authReady,
		currentUser,
		signInAnonymouslyForDebug,
		waitForAuthReady
	} from '$lib/firebase/auth';
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
	import { formatLastUpdated, formatReservationDate } from '$lib/utils/format';
	import { inviteUrl } from '$lib/utils/links';
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
	const rsvpHeroImages = ['/images/events/den.png', '/images/events/decca.png', '/images/events/monarch.png'];
	const fireworkParticleAngles = Array.from({ length: 14 }, (_, index) => index);

	type FireworkBurst = {
		id: number;
		x: number;
		y: number;
		hue: number;
		delayMs: number;
		scale: number;
	};

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
	let fireworkBursts = $state<FireworkBurst[]>([]);

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
	let fireworksClearTimer: ReturnType<typeof setTimeout> | null = null;
	let nextFireworkId = 1;
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
		fireworkBursts = [
			{
				id: nextFireworkId++,
				x: 22 + Math.random() * 10,
				y: 35 + Math.random() * 10,
				hue: 250 + Math.floor(Math.random() * 30),
				delayMs: 0,
				scale: 1
			},
			{
				id: nextFireworkId++,
				x: 50 + Math.random() * 6,
				y: 26 + Math.random() * 8,
				hue: 186 + Math.floor(Math.random() * 28),
				delayMs: 90,
				scale: 1.1
			},
			{
				id: nextFireworkId++,
				x: 72 + Math.random() * 10,
				y: 33 + Math.random() * 9,
				hue: 318 + Math.floor(Math.random() * 25),
				delayMs: 170,
				scale: 0.95
			}
		];
		if (celebrateTimer) {
			clearTimeout(celebrateTimer);
		}
		if (fireworksClearTimer) {
			clearTimeout(fireworksClearTimer);
		}
		celebrateTimer = setTimeout(() => {
			celebrateAccepted = false;
			celebrateTimer = null;
		}, 1300);
		fireworksClearTimer = setTimeout(() => {
			fireworkBursts = [];
			fireworksClearTimer = null;
		}, 1500);
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
		if (fireworksClearTimer) {
			clearTimeout(fireworksClearTimer);
			fireworksClearTimer = null;
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
			await waitForAuthReady();
			if (!$currentUser) {
				errorMessage = 'Sign in is required to save your RSVP.';
				return;
			}
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
			await waitForAuthReady();
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

	async function copyInviteLinkToClipboard(): Promise<void> {
		if (!reservationId) {
			return;
		}

		try {
			await navigator.clipboard.writeText(inviteUrl(reservationId));
			pushToast({
				title: 'Invite link copied',
				description: 'Share it with your group.',
				variant: 'success'
			});
		} catch {
			pushToast({
				title: 'Could not copy link',
				description: 'Please copy the URL from your browser address bar.',
				variant: 'default'
			});
		}
	}

	function formatGoogleCalendarDate(value: Date): string {
		return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	}

	function addToCalendar(): void {
		if (!startDate) {
			return;
		}

		const eventEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
		const params = new URLSearchParams({
			action: 'TEMPLATE',
			text: reservation ? `${reservation.clubName} RSVP` : 'RSVP Invite',
			dates: `${formatGoogleCalendarDate(startDate)}/${formatGoogleCalendarDate(eventEnd)}`,
			details: reservation?.notes ?? '',
			location: reservation?.tableType ?? ''
		});
		window.open(
			`https://calendar.google.com/calendar/render?${params.toString()}`,
			'_blank',
			'noopener,noreferrer'
		);
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
	const heroImageUrl = $derived(rsvpHeroImages[themeIndex] ?? '');
	const heroPosterClass = $derived(
		themeIndex === 0
			? 'bg-[radial-gradient(circle_at_16%_18%,rgba(59,130,246,0.45),transparent_40%),radial-gradient(circle_at_84%_10%,rgba(16,185,129,0.3),transparent_36%),linear-gradient(160deg,#050911_0%,#0a1326_55%,#030712_100%)]'
			: themeIndex === 1
				? 'bg-[radial-gradient(circle_at_14%_22%,rgba(34,197,94,0.42),transparent_42%),radial-gradient(circle_at_84%_14%,rgba(250,204,21,0.26),transparent_36%),linear-gradient(165deg,#07120d_0%,#122318_55%,#030a06_100%)]'
				: 'bg-[radial-gradient(circle_at_18%_20%,rgba(14,165,233,0.4),transparent_40%),radial-gradient(circle_at_84%_8%,rgba(168,85,247,0.28),transparent_38%),linear-gradient(158deg,#05111a_0%,#102438_55%,#03080f_100%)]'
	);
	const visibleAttendees = $derived(publicAttendees.slice(0, 3));
	const hiddenAttendeesCount = $derived(Math.max(0, publicAttendees.length - visibleAttendees.length));
</script>

<main class="-mb-16 relative flex min-h-screen flex-col overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	{#if fireworkBursts.length > 0}
		<div class="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true">
			{#each fireworkBursts as burst (burst.id)}
				<div
					class="firework-burst"
					style={`left:${burst.x}%;top:${burst.y}%;--firework-hue:${burst.hue};--firework-delay:${burst.delayMs}ms;--firework-scale:${burst.scale};`}
				>
					{#each fireworkParticleAngles as particleIndex (particleIndex)}
						<span
							class="firework-particle"
							style={`--firework-rotation:${particleIndex * (360 / fireworkParticleAngles.length)}deg;--firework-distance:${56 + (particleIndex % 4) * 10}px;`}
						></span>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="pointer-events-none fixed inset-0 bg-[radial-gradient(55rem_36rem_at_-12%_-8%,rgb(168_85_247_/_0.18),transparent_56%),radial-gradient(48rem_28rem_at_96%_10%,rgb(34_211_238_/_0.1),transparent_56%),linear-gradient(180deg,#07070b_0%,#09090f_45%,#050507_100%)]"
	></div>

	<AppHeader />

	<div class="relative z-10 flex-1 pb-12 pt-4 sm:pt-6">
		{#if loadingReservation}
			<section class="mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
					<p aria-live="polite">Loading reservation...</p>
				</div>
			</section>
		{:else if !reservation}
			<section class="mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
					<p class="text-base font-semibold text-white">Reservation not found</p>
					<p class="mt-1 text-sm">This invite may be invalid, expired, or removed by the host.</p>
					<a
						class="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-violet-500/50 hover:text-white"
						href="/"
					>
						Back to home
					</a>
				</div>
			</section>
		{:else}
			<section class="mx-auto w-full max-w-[1440px] px-0 sm:px-6 lg:px-10">
				<article class="overflow-hidden border-y border-zinc-800 bg-[#050507] sm:rounded-2xl sm:border">
					<div class="relative h-[240px] overflow-hidden sm:h-[300px] lg:h-[420px]">
						{#if heroImageUrl}
							<img
								src={heroImageUrl}
								alt={`Invite cover for ${reservation.clubName}`}
								class="h-full w-full object-cover"
								loading="lazy"
								decoding="async"
							/>
						{:else}
							<div class={`h-full w-full ${heroPosterClass}`}></div>
						{/if}
						<div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,7,0.1)_0%,rgba(5,5,7,0.52)_55%,rgba(5,5,7,0.96)_100%)]"></div>
						<div class="absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-6 sm:pb-6 lg:px-10 lg:pb-8">
							<div class="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-black/50 px-2.5 py-1">
								<span class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-violet-400/35 bg-violet-500/20 text-[11px] font-semibold text-violet-200" style="font-family: 'Space Grotesk', sans-serif;">
									{hostInitials}
								</span>
								<div class="leading-tight">
									<p class="text-[10px] uppercase tracking-[0.1em] text-zinc-300">Hosted by</p>
									<p class="text-sm font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">{hostName}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="grid gap-8 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:px-10 lg:py-10">
						<div class="space-y-6">
							<div>
								<h1 class="text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style="font-family: 'Space Grotesk', sans-serif;">
									{reservation.clubName}
								</h1>
								<p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-300 sm:text-base">{reservation.notes}</p>
							</div>

							<div class="space-y-3">
								<div class="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2.5">
									<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
										<Calendar class="h-4 w-4" />
									</span>
									<div class="min-w-0">
										<p class="text-sm font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">{startsAtText || 'Date pending'}</p>
										<p class="text-xs text-zinc-400">{countdownHeadline}</p>
									</div>
								</div>
								<div class="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2.5">
									<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
										<MapPin class="h-4 w-4" />
									</span>
									<div class="min-w-0">
										<p class="text-sm font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">{reservation.tableType}</p>
										<p class="text-xs text-zinc-400">{countdownSubline}</p>
									</div>
								</div>
								<div class="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2.5">
									<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-lime-400/15 text-lime-300">
										<Users class="h-4 w-4" />
									</span>
									<div class="min-w-0">
										<p class="text-sm font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">
											{reservation.claimedCount} going - {spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} left
										</p>
										<p class="text-xs text-zinc-400">
											{reservation.plusOnesEnabled === false ? 'Plus-ones currently disabled' : 'Plus-ones allowed (up to 4)'}
										</p>
									</div>
								</div>
							</div>

							<div class="h-px w-full bg-zinc-800"></div>

							<section class="space-y-4">
								<div>
									<p class="text-lg font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">Are you going?</p>
									{#if lowSpotsWarning}
										<p class="mt-1 text-sm text-amber-300">Only {spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} left.</p>
									{/if}
								</div>

								{#if !$currentUser}
									<p class="text-sm text-zinc-300">Sign in with phone verification to respond and reserve your spot.</p>
									{#if errorMessage}
										<p class="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" aria-live="polite">{errorMessage}</p>
									{/if}
									<div class="flex flex-wrap gap-2">
										<Button onclick={joinGuestlist}>Join Guestlist</Button>
										<button
											type="button"
											class="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 transition hover:border-violet-500/55 hover:text-white"
											onclick={openGuestSignIn}
										>
											Sign in
										</button>
									</div>
								{:else if hostRoleChecking}
									<p class="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300" aria-live="polite">
										Checking your access...
									</p>
								{:else if hostViewOnly}
									<div class="space-y-3 rounded-xl border border-violet-500/35 bg-violet-500/10 p-4">
										<p class="text-sm font-semibold text-white">Host preview mode</p>
										<p class="text-sm text-zinc-300">Hosts can view this guest page, but RSVP actions are disabled.</p>
										<div class="flex flex-wrap gap-2">
											<a
												class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 transition hover:border-violet-500/55 hover:text-white"
												href={`/r/${reservationId}/host`}
											>
												Open host hub
											</a>
											<a
												class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 transition hover:border-violet-500/55 hover:text-white"
												href={`/r/${reservationId}/checkin`}
											>
												Open check-in
											</a>
										</div>
									</div>
								{:else}
									<div class="space-y-2">
										<Label for="displayName" class="text-zinc-200">Display name</Label>
										<Input
											id="displayName"
											bind:value={displayName}
											placeholder="Your full name"
											class="border-zinc-700 bg-zinc-900/85 text-zinc-100 placeholder:text-zinc-500"
											oninput={clearFormErrors}
										/>
										<p class="text-xs text-zinc-400">This name appears on the guest list.</p>
									</div>

									{#if blocksNewAcceptance}
										<div class="space-y-3 rounded-xl border border-rose-400/35 bg-rose-500/10 p-4">
											<p class="text-sm font-semibold text-rose-100">This guest list is full right now.</p>
											<p class="text-xs text-zinc-300">Join the waitlist to stay on standby if a spot opens.</p>
											<Button
												size="sm"
												variant={waitlistJoined ? 'success' : 'outline'}
												onclick={joinWaitlist}
												disabled={waitlistSubmitting}
											>
												{waitlistSubmitting ? 'Saving...' : waitlistJoined ? 'On waitlist' : 'Join waitlist'}
											</Button>
											{#if waitlistError}
												<p class="text-xs text-rose-200">{waitlistError}</p>
											{/if}
										</div>
									{/if}

									<div class="grid gap-2 sm:grid-cols-3">
										<button
											type="button"
											aria-pressed={status === 'accepted'}
											disabled={blocksNewAcceptance}
											class={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
												status === 'accepted'
													? 'border-violet-500/65 bg-gradient-to-r from-violet-500 to-violet-700 text-white'
													: 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-violet-500/45 hover:text-white'
											}`}
											onclick={() => {
												status = 'accepted';
												clearFormErrors();
											}}
										>
											<Sparkles class="h-4 w-4" />
											Going
										</button>
										<button
											type="button"
											disabled
											class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-500 opacity-80"
											title="Maybe is not available yet"
										>
											<Clock3 class="h-4 w-4" />
											Maybe
										</button>
										<button
											type="button"
											aria-pressed={status === 'declined'}
											class={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
												status === 'declined'
													? 'border-rose-500/65 bg-gradient-to-r from-rose-500 to-red-600 text-white'
													: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-rose-500/45 hover:text-white'
											}`}
											onclick={() => {
												status = 'declined';
												clearFormErrors();
											}}
										>
											<X class="h-4 w-4" />
											Can&apos;t Go
										</button>
									</div>

									{#if plusOnesEnabled}
										<div class="space-y-2">
											<div class="flex items-baseline justify-between gap-2">
												<Label for="plusOnes" class="text-zinc-200">Plus-ones (optional)</Label>
												<span class="text-xs text-zinc-400">{parsedPlusOnes.length}/4</span>
											</div>
											<Textarea
												id="plusOnes"
												rows={3}
												bind:value={plusOneLines}
												placeholder="One name per line, max 4"
												class="border-zinc-700 bg-zinc-900/85 text-zinc-100 placeholder:text-zinc-500"
												oninput={clearFormErrors}
											/>
											{#if parsedPlusOnes.length > 0}
												<p class="text-xs text-zinc-400">Adding: {parsedPlusOnes.join(', ')}</p>
											{/if}
										</div>
									{:else}
										<p class="text-xs text-zinc-400">The host has disabled plus-ones for this invite.</p>
									{/if}

									{#if errorMessage}
										<p class="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" aria-live="polite">
											{errorMessage}
										</p>
									{/if}

									<div class="relative inline-flex">
										<Button onclick={submitRsvp} disabled={submitting} class="relative z-10">
											{submitting ? 'Saving...' : guest ? 'Update RSVP' : 'Save RSVP'}
										</Button>
										{#if celebrateAccepted}
											<span class="pointer-events-none absolute -inset-3 rounded-pill border border-violet-400/45 animate-ping"></span>
										{/if}
									</div>
								{/if}

								{#if guest}
									<div class="rounded-xl border border-zinc-700 bg-zinc-900/55 p-3">
										<p class="text-sm font-semibold text-white">
											{guest.status === 'accepted' ? 'You already responded: Going' : 'You already responded: Cannot Go'}
										</p>
										{#if guestLastUpdated}
											<p class="mt-1 text-xs text-zinc-400">{guestLastUpdated}</p>
										{/if}
									</div>
								{/if}
							</section>

							{#if !productionLike && debugMessage}
								<p class="rounded-lg border border-zinc-700 bg-zinc-900/65 px-3 py-2 text-xs text-zinc-300">{debugMessage}</p>
							{/if}
						</div>

						<aside class="space-y-6">
							<section class="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
								<div class="flex items-center justify-between gap-3">
									<p class="text-lg font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">Who&apos;s Going</p>
									<span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-300">
										{reservation.claimedCount}
									</span>
								</div>

								{#if !publicGuestListVisible}
									<p class="text-sm text-zinc-400">The host has hidden the public guest list.</p>
								{:else if publicAttendees.length === 0}
									<p class="text-sm text-zinc-400">No accepted guests yet. Check back soon.</p>
								{:else}
									<div class="flex items-center">
										{#each visibleAttendees as attendee, index (attendee.uid)}
											<span
												class="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#050507] bg-violet-500/25 text-xs font-semibold text-violet-100 first:ml-0"
												style={`z-index:${10 - index}`}
											>
												{initials(attendee.namePublic)}
											</span>
										{/each}
										{#if hiddenAttendeesCount > 0}
											<span class="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[11px] font-semibold text-zinc-300">
												+{hiddenAttendeesCount}
											</span>
										{/if}
									</div>

									<div class="space-y-2">
										{#each visibleAttendees as attendee (attendee.uid)}
											<div class="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-white">{attendee.namePublic}</p>
													<p class="text-xs text-violet-300">Going</p>
												</div>
												<p class="text-[11px] text-zinc-500">recent</p>
											</div>
										{/each}
									</div>

									<button
										type="button"
										class="text-xs font-semibold text-violet-300 transition hover:text-violet-200"
										onclick={() => {
											guestListDialogOpen = true;
										}}
									>
										View all {publicAttendees.length} guests ?
									</button>
								{/if}
							</section>

							<section class="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
								<p class="text-lg font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">Comments</p>
								{#if loadingComments}
									<div class="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-400">Loading updates...</div>
								{:else if comments.length === 0}
									<div class="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-400">No updates yet. Be the first to post.</div>
								{:else}
									<div class="space-y-2">
										{#each comments as comment (comment.id)}
											<div class="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
												<div class="flex items-center justify-between gap-2">
													<p class="text-xs font-semibold text-white">{comment.displayName}</p>
													<p class="text-[11px] text-zinc-500">{formatCommentTime(comment.createdAt)}</p>
												</div>
												<p class="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-300">{comment.text}</p>
											</div>
										{/each}
									</div>
								{/if}

								<div class="rounded-lg border border-zinc-700 bg-zinc-950/60 p-2">
									<div class="flex items-center gap-2">
										<Input
											placeholder="Add a comment..."
											bind:value={commentDraft}
											maxlength={maxCommentLength}
											disabled={postingComment}
											class="h-9 border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500"
											oninput={() => {
												commentError = '';
											}}
										/>
										{#if $currentUser}
											<button
												type="button"
												class="inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
												onclick={handlePostComment}
												disabled={postingComment || commentDraft.trim().length === 0}
											>
												{postingComment ? 'Posting...' : 'Post'}
											</button>
										{:else}
											<button
												type="button"
												class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 transition hover:border-violet-500/55 hover:text-white"
												onclick={openGuestSignIn}
											>
												Sign in
											</button>
										{/if}
									</div>
									<div class="mt-2 flex items-center justify-between gap-2">
										<p class="text-[11px] text-zinc-500">{commentDraft.trim().length}/{maxCommentLength}</p>
										{#if commentError}
											<p class="text-[11px] text-rose-300">{commentError}</p>
										{/if}
									</div>
								</div>
							</section>

							<section class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
								<button
									type="button"
									class="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 transition hover:border-violet-500/55 hover:text-white"
									onclick={addToCalendar}
								>
									Add to Calendar
								</button>
								<button
									type="button"
									class="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 transition hover:border-violet-500/55 hover:text-white"
									onclick={copyInviteLinkToClipboard}
								>
									Copy Link
								</button>
							</section>
						</aside>
					</div>
				</article>
			</section>
		{/if}
	</div>

	<footer class="relative z-10 mt-2 w-full border-t border-zinc-800 bg-[#0e0e12]">
		<div class="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-8 text-zinc-300 sm:px-8 lg:px-12">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-lg font-extrabold uppercase text-white" style="font-family: 'Space Grotesk', sans-serif;">Apollo HQ</p>
					<p class="text-sm text-zinc-400">Your gateway to underground nights and hosted experiences.</p>
				</div>
			</div>
			<div class="flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
				<p class="text-sm text-zinc-300">Stay in the loop when newly published events drop.</p>
				<a href="/event" class="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-3 text-xs font-bold text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]">Browse Events</a>
			</div>
			<div class="flex flex-col gap-2 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
				<span>(c) 2026 Apollo HQ. All rights reserved.</span>
			</div>
		</div>
	</footer>
</main>
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

<style>
	.firework-burst {
		position: absolute;
		width: 0;
		height: 0;
		transform: translate(-50%, -50%) scale(var(--firework-scale));
		animation: firework-fade 1150ms var(--firework-delay) cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	.firework-particle {
		position: absolute;
		left: 0;
		top: 0;
		width: 4px;
		height: 18px;
		border-radius: 999px;
		background: linear-gradient(
			to top,
			hsl(var(--firework-hue) 95% 62% / 0.95),
			hsl(calc(var(--firework-hue) + 28) 96% 76% / 0.9)
		);
		box-shadow:
			0 0 8px hsl(var(--firework-hue) 95% 68% / 0.55),
			0 0 16px hsl(var(--firework-hue) 95% 62% / 0.35);
		opacity: 0;
		transform: rotate(var(--firework-rotation)) translateY(0) scale(0.35);
		animation: firework-shoot 900ms var(--firework-delay) cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	@keyframes firework-shoot {
		0% {
			opacity: 0;
			transform: rotate(var(--firework-rotation)) translateY(0) scale(0.35);
		}
		20% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: rotate(var(--firework-rotation)) translateY(calc(var(--firework-distance) * -1))
				scale(0.95);
		}
	}

	@keyframes firework-fade {
		0% {
			opacity: 0.25;
		}
		20% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
</style>


