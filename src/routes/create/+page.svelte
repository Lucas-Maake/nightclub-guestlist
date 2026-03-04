<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import {
		Calendar,
		LayoutGrid,
		Minus,
		Plus,
		QrCode as QrCodeIcon,
		Shirt,
		Users
	} from 'lucide-svelte';
	import QRCode from 'qrcode';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { findEventById } from '$lib/data/events';
	import { createReservationSchema } from '$lib/schemas/reservation';
	import { createReservation, getPublishedEventById, getReservationPublic } from '$lib/firebase/firestore';
	import { getCurrentUser, signInAnonymouslyForDebug, waitForAuthReady } from '$lib/firebase/auth';
	import type { CreateReservationInput, ReservationPublicRecord } from '$lib/types/models';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { toUserSafeCreateMessage } from '$lib/utils/messages';
	import { canUseDebugMode, isProductionLikeRuntime } from '$lib/utils/security';
	import { inviteDebugUrl, inviteUrl } from '$lib/utils/links';

type FormState = CreateReservationInput;
type StartPreset = 'plus2h' | 'tonight' | 'tomorrow10';

const now = new Date();
now.setHours(now.getHours() + 3, 0, 0, 0);
const productionLike = isProductionLikeRuntime();
const TABLE_TYPE_OPTIONS = [
	'VIP Tables',
	'Ground Floor Tables',
	'DJ Tables',
	'Mezzanine Tables',
	'Private Buyout'
] as const;
const inviteDateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});
const inviteTimeFormatter = new Intl.DateTimeFormat('en-US', {
	hour: 'numeric',
	minute: '2-digit'
});

const defaultForm: FormState = {
		clubName: '',
		startAt: toDateTimeInput(now),
		tableType: '',
		capacity: 6,
		notes: '',
		dressCode: '',
		debugEnabled: false
	};

	let form = $state<FormState>({ ...defaultForm });
	let fieldErrors = $state<Partial<Record<keyof FormState, string>>>({});
	let isSubmitting = $state(false);
	let globalError = $state('');
	let activeStartPreset = $state<StartPreset | null>(null);

let shareReservationId = $state('');
let shareDebugToken = $state('');
let shareReservation = $state<ReservationPublicRecord | null>(null);
let shareLoading = $state(false);
let inviteCopied = $state(false);
let debugInviteCopied = $state(false);
let inviteQrDataUrl = $state('');
let inviteQrLoading = $state(false);
let copyingTarget = $state<'invite' | 'debug' | null>(null);

let inviteCopiedTimeout: ReturnType<typeof setTimeout> | null = null;
let debugInviteCopiedTimeout: ReturnType<typeof setTimeout> | null = null;
let appliedPrefillSignature = $state('');

	function toDateTimeInput(date: Date): string {
		const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
	}

	function parseDateTimeInput(value: string): Date | null {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function parseUrlState(): { reservationId: string; debugToken: string } {
		const reservationId = $page.url.searchParams.get('reservationId') ?? '';
		const debugToken = $page.url.searchParams.get('debug') ?? '';
		return { reservationId, debugToken };
	}

	function trimBounded(value: string | null, maxLength: number): string | undefined {
		if (!value) {
			return undefined;
		}

		const trimmed = value.trim();
		if (!trimmed) {
			return undefined;
		}

		return trimmed.slice(0, maxLength);
	}

	function normalizeTableTypeSelection(value: string | null | undefined): string | undefined {
		if (!value) {
			return undefined;
		}

		const trimmed = value.trim();
		if (!trimmed) {
			return undefined;
		}

		const exactMatch = TABLE_TYPE_OPTIONS.find(
			(option) => option.toLowerCase() === trimmed.toLowerCase()
		);
		if (exactMatch) {
			return exactMatch;
		}

		const normalized = trimmed.toLowerCase();
		if (normalized.includes('vip')) {
			return 'VIP Tables';
		}
		if (normalized.includes('ground') || normalized.includes('main floor')) {
			return 'Ground Floor Tables';
		}
		if (normalized.includes('dj')) {
			return 'DJ Tables';
		}
		if (normalized.includes('mezz')) {
			return 'Mezzanine Tables';
		}
		if (normalized.includes('buyout') || normalized.includes('private')) {
			return 'Private Buyout';
		}

		return undefined;
	}

	function normalizePrefillStartAt(value: string | null): string | undefined {
		if (!value) {
			return undefined;
		}

		const trimmed = value.trim();
		if (!trimmed) {
			return undefined;
		}

		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
			return trimmed;
		}

		const parsed = new Date(trimmed);
		if (Number.isNaN(parsed.getTime())) {
			return undefined;
		}

		return toDateTimeInput(parsed);
	}

	function prefillSignature(params: URLSearchParams): string {
		const keys = ['eventId', 'clubName', 'startAt', 'tableType', 'notes', 'dressCode', 'capacity'];
		return keys.map((key) => `${key}=${params.get(key) ?? ''}`).join('&');
	}

	function applyCreatePrefillFromUrl(): void {
		const params = $page.url.searchParams;
		const reservationId = params.get('reservationId');
		if (reservationId) {
			appliedPrefillSignature = '';
			return;
		}

		const signature = prefillSignature(params);
		if (!signature || signature === appliedPrefillSignature) {
			return;
		}

		const eventId = trimBounded(params.get('eventId'), 120);
		const linkedEvent = eventId ? findEventById(eventId) : null;

		const nextForm: FormState = { ...form };
		let hasPrefill = false;

		if (linkedEvent) {
			nextForm.clubName = linkedEvent.venue;
			nextForm.startAt = toDateTimeInput(new Date(linkedEvent.startAt));
			nextForm.tableType = normalizeTableTypeSelection(linkedEvent.defaultTableType) ?? '';
			nextForm.notes = `${linkedEvent.title} - table request from event detail page.`;
			nextForm.dressCode = linkedEvent.dressCode;
			hasPrefill = true;
		}

		const clubName = trimBounded(params.get('clubName'), 100);
		if (clubName) {
			nextForm.clubName = clubName;
			hasPrefill = true;
		}

		const startAt = normalizePrefillStartAt(params.get('startAt'));
		if (startAt) {
			nextForm.startAt = startAt;
			hasPrefill = true;
		}

		const tableType = normalizeTableTypeSelection(trimBounded(params.get('tableType'), 80));
		if (tableType) {
			nextForm.tableType = tableType;
			hasPrefill = true;
		}

		const notes = trimBounded(params.get('notes'), 500);
		if (notes) {
			nextForm.notes = notes;
			hasPrefill = true;
		}

		const dressCode = trimBounded(params.get('dressCode'), 120);
		if (dressCode) {
			nextForm.dressCode = dressCode;
			hasPrefill = true;
		}

		const capacityRaw = params.get('capacity');
		if (capacityRaw) {
			const parsedCapacity = Number(capacityRaw);
			if (Number.isFinite(parsedCapacity)) {
				nextForm.capacity = clampCapacity(Math.round(parsedCapacity));
				hasPrefill = true;
			}
		}

		if (!hasPrefill) {
			return;
		}

		form = nextForm;
		appliedPrefillSignature = signature;
	}

	async function hydrateShareState(): Promise<void> {
		const { reservationId, debugToken } = parseUrlState();
		shareReservationId = reservationId;
		shareDebugToken = productionLike ? '' : debugToken;
		inviteCopied = false;
		debugInviteCopied = false;

		if (!reservationId) {
			shareReservation = null;
			return;
		}

		shareLoading = true;
		shareReservation = await getReservationPublic(reservationId);
		shareLoading = false;
	}

	function startPresetDate(preset: StartPreset): Date {
		const current = new Date();

		if (preset === 'plus2h') {
			const baseDate = parseDateTimeInput(form.startAt) ?? current;
			const next = new Date(baseDate);
			next.setHours(next.getHours() + 2);
			return next;
		}

		const next = new Date(current);
		if (preset === 'tonight') {
			next.setHours(22, 0, 0, 0);
			if (next <= current) {
				next.setDate(next.getDate() + 1);
			}
			return next;
		}

		next.setDate(next.getDate() + 1);
		next.setHours(22, 0, 0, 0);
		return next;
	}

	function applyStartPreset(preset: StartPreset): void {
		form.startAt = toDateTimeInput(startPresetDate(preset));
		activeStartPreset = preset;
	}

	function startPresetButtonClass(preset: StartPreset): string {
		const active = activeStartPreset === preset;
		return [
			'inline-flex h-9 items-center rounded-full border px-4 text-[11px] font-semibold uppercase tracking-[0.12em] transition',
			'font-mono',
			active
				? 'border-violet-500/45 bg-violet-500/15 text-violet-300'
				: 'border-zinc-800 bg-[#1A1A22] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
		].join(' ');
	}

	function clampCapacity(value: number): number {
		return Math.min(100, Math.max(1, value));
	}

	function stepCapacity(delta: number): void {
		const currentCapacity = Number(form.capacity);
		const nextCapacity = Number.isFinite(currentCapacity) ? currentCapacity + delta : 1;
		form.capacity = clampCapacity(nextCapacity);
	}

	function normalizeCapacity(): void {
		const parsedCapacity = Number(form.capacity);
		form.capacity = Number.isFinite(parsedCapacity) ? clampCapacity(Math.round(parsedCapacity)) : 1;
	}

	async function ensureCreateRouteAccess(): Promise<boolean> {
		const params = $page.url.searchParams;
		const reservationId = trimBounded(params.get('reservationId'), 120);
		if (reservationId) {
			return true;
		}

		const eventId = trimBounded(params.get('eventId'), 120);
		if (!eventId) {
			await goto('/event', { replaceState: true });
			return false;
		}

		const event = await getPublishedEventById(eventId);
		if (!event) {
			await goto('/event', { replaceState: true });
			return false;
		}

		return true;
	}

	onMount(async () => {
		const allowed = await ensureCreateRouteAccess();
		if (!allowed) {
			return;
		}

		await waitForAuthReady();
		applyCreatePrefillFromUrl();
		await hydrateShareState();
	});

	afterNavigate(async () => {
		const allowed = await ensureCreateRouteAccess();
		if (!allowed) {
			return;
		}

		applyCreatePrefillFromUrl();
		await hydrateShareState();
	});

	onDestroy(() => {
		if (inviteCopiedTimeout) {
			clearTimeout(inviteCopiedTimeout);
			inviteCopiedTimeout = null;
		}
		if (debugInviteCopiedTimeout) {
			clearTimeout(debugInviteCopiedTimeout);
			debugInviteCopiedTimeout = null;
		}
	});

	function resetErrors(): void {
		fieldErrors = {};
		globalError = '';
	}

	function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
		return Promise.race<T>([
			promise,
			new Promise<T>((_, reject) => {
				setTimeout(() => reject(new Error(timeoutMessage)), ms);
			})
		]);
	}

	async function ensureCreateUser(debugEnabled: boolean): Promise<string | null> {
		const current = getCurrentUser();
		if (current) {
			return current.uid;
		}

		if (debugEnabled && canUseDebugMode()) {
			await withTimeout(
				signInAnonymouslyForDebug(),
				12_000,
				'Quick-access sign-in timed out. Please try again.'
			);
			await waitForAuthReady();
			return getCurrentUser()?.uid ?? null;
		}

		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		const authResult = await openAuthModal({ returnTo, source: 'create-submit' });
		if (authResult !== 'authenticated') {
			return null;
		}

		await waitForAuthReady();
		return getCurrentUser()?.uid ?? null;
	}

	async function handleCreateReservation(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		resetErrors();
		isSubmitting = true;

		const formCandidate: FormState = productionLike ? { ...form, debugEnabled: false } : form;
		const parsed = createReservationSchema.safeParse(formCandidate);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === 'string') {
					fieldErrors[key as keyof FormState] = issue.message;
				}
			}
			isSubmitting = false;
			return;
		}

		if (parsed.data.debugEnabled && !canUseDebugMode()) {
			globalError = productionLike
				? 'This testing option is unavailable right now.'
				: 'This quick-access option is unavailable in this environment.';
			isSubmitting = false;
			return;
		}

		try {
			const uid = await ensureCreateUser(parsed.data.debugEnabled);
			if (!uid) {
				globalError = 'Sign in is required to create a reservation.';
				return;
			}

			const { reservationId, debugToken } = await withTimeout(
				createReservation(parsed.data, uid),
				15_000,
				'Create reservation timed out. Please try again.'
			);
			const next = new URLSearchParams({ reservationId });
			if (debugToken) {
				next.set('debug', debugToken);
			}

			pushToast({
				title: 'Reservation created',
				description: 'Share link is ready to send.',
				variant: 'success'
			});

			await goto(`/create?${next.toString()}`);
		} catch (error) {
			globalError = toUserSafeCreateMessage(error, productionLike);
		} finally {
			isSubmitting = false;
		}
	}

async function copyText(value: string, successLabel: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		pushToast({
			title: successLabel,
			description: value,
			variant: 'success'
		});
		return true;
	} catch {
		pushToast({
			title: 'Copy failed',
			description: 'Could not copy link. Try again.',
			variant: 'destructive'
		});
		return false;
	}
}

const invite = $derived(shareReservationId ? inviteUrl(shareReservationId) : '');
const debugInvite = $derived(
	!productionLike && shareReservationId && shareDebugToken
		? inviteDebugUrl(shareReservationId, shareDebugToken)
		: ''
);
const shareStartLine = $derived.by(() => {
	if (!shareReservation?.startAt || !('toDate' in shareReservation.startAt)) {
		return 'Start time pending';
	}

	const value = shareReservation.startAt.toDate();
	return `${inviteDateFormatter.format(value)} at ${inviteTimeFormatter.format(value)}`;
});
const shareDressCodeLine = $derived(shareReservation?.dressCode?.trim() || 'Not specified');
const shareSpotsLeft = $derived.by(() => {
	if (!shareReservation) {
		return 0;
	}
	return Math.max(0, shareReservation.capacity - shareReservation.claimedCount);
});
const shareCapacityPercent = $derived.by(() => {
	if (!shareReservation || shareReservation.capacity <= 0) {
		return 0;
	}

	return Math.max(
		0,
		Math.min(100, Math.round((shareReservation.claimedCount / shareReservation.capacity) * 100))
	);
});
const shareCapacityBarWidth = $derived.by(() => {
	if (shareCapacityPercent <= 0) {
		return 0;
	}
	return Math.max(shareCapacityPercent, 6);
});
const startAtError = $derived.by(() => {
	const parsedStartAt = createReservationSchema.shape.startAt.safeParse(form.startAt);
	return parsedStartAt.success
		? ''
		: parsedStartAt.error.issues[0]?.message ?? 'Valid date and time is required.';
});
const canSubmitCreate = $derived(createReservationSchema.safeParse(form).success && !isSubmitting);

function markCopied(target: 'invite' | 'debug'): void {
	if (target === 'invite') {
		inviteCopied = true;
		if (inviteCopiedTimeout) {
			clearTimeout(inviteCopiedTimeout);
		}
		inviteCopiedTimeout = setTimeout(() => {
			inviteCopied = false;
			inviteCopiedTimeout = null;
		}, 2200);
		return;
	}

	debugInviteCopied = true;
	if (debugInviteCopiedTimeout) {
		clearTimeout(debugInviteCopiedTimeout);
	}
	debugInviteCopiedTimeout = setTimeout(() => {
		debugInviteCopied = false;
		debugInviteCopiedTimeout = null;
	}, 2200);
}

async function copyShareLink(
	value: string,
	successLabel: string,
	target: 'invite' | 'debug'
): Promise<void> {
	copyingTarget = target;
	try {
		const copied = await copyText(value, successLabel);
		if (copied) {
			markCopied(target);
		}
	} finally {
		if (copyingTarget === target) {
			copyingTarget = null;
		}
	}
}

$effect(() => {
	const value = invite;
	if (!value) {
		inviteQrDataUrl = '';
		inviteQrLoading = false;
		return;
	}

	let cancelled = false;
	inviteQrLoading = true;
	void QRCode.toDataURL(value, {
		width: 280,
		margin: 1,
		errorCorrectionLevel: 'M'
	})
		.then((dataUrl) => {
			if (!cancelled) {
				inviteQrDataUrl = dataUrl;
			}
		})
		.catch(() => {
			if (!cancelled) {
				inviteQrDataUrl = '';
			}
		})
		.finally(() => {
			if (!cancelled) {
				inviteQrLoading = false;
			}
		});

	return () => {
		cancelled = true;
	};
});
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-10">
	{#if shareReservationId}
		<section class="mx-auto w-full max-w-[1440px] space-y-6 text-white">
			<div class="flex items-center gap-2 bg-[linear-gradient(90deg,rgba(168,85,247,0.12)_0%,rgba(5,5,7,0)_100%)] px-5 py-3 sm:px-8 lg:px-10">
				<span class="h-2.5 w-2.5 rounded-full bg-lime-300"></span>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-lime-300" style="font-family: 'Space Mono', monospace;">
					Invite is live
				</p>
			</div>

			{#if shareLoading}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] px-6 py-10 text-sm text-zinc-400">
					Loading invite preview...
				</div>
			{:else if shareReservation}
				<div class="space-y-1 px-5 sm:px-8 lg:px-10">
					<p class="text-[11px] uppercase tracking-[0.2em] text-zinc-500" style="font-family: 'Space Mono', monospace;">
						Reservation invite
					</p>
					<h1 class="text-4xl font-extrabold text-white" style="font-family: 'Space Grotesk', sans-serif;">
						{shareReservation.clubName}
					</h1>
					<p class="max-w-[800px] text-sm text-zinc-400">{shareReservation.notes}</p>
				</div>

				<div class="px-5 sm:px-8 lg:px-10">
					<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-7">
						<div class="grid gap-4 md:grid-cols-3">
							<div class="space-y-2 rounded-xl border border-zinc-800 bg-[#1A1A22] px-5 py-4">
								<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Starts</p>
								<div class="flex items-center gap-2.5">
									<Calendar class="h-4 w-4 text-violet-400" />
									<p class="text-sm font-semibold text-white">{shareStartLine}</p>
								</div>
							</div>
							<div class="space-y-2 rounded-xl border border-zinc-800 bg-[#1A1A22] px-5 py-4">
								<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Table</p>
								<div class="flex items-center gap-2.5">
									<LayoutGrid class="h-4 w-4 text-cyan-400" />
									<p class="text-sm font-semibold text-white">{shareReservation.tableType}</p>
								</div>
							</div>
							<div class="space-y-2 rounded-xl border border-zinc-800 bg-[#1A1A22] px-5 py-4">
								<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Capacity</p>
								<div class="flex items-center gap-2.5">
									<Users class="h-4 w-4 text-lime-300" />
									<p class="text-sm font-semibold text-white">{shareReservation.capacity} guests</p>
								</div>
							</div>
						</div>
						<div class="mt-4 space-y-2 rounded-xl border border-zinc-800 bg-[#1A1A22] px-5 py-4">
							<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Dress code</p>
							<div class="flex items-center gap-2.5">
								<Shirt class="h-4 w-4 text-pink-400" />
								<p class="text-sm font-semibold text-white">{shareDressCodeLine}</p>
							</div>
						</div>
					</div>
				</div>

				<div class="grid gap-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-10">
					<section class="rounded-2xl border border-zinc-800 bg-[#14141A] p-7">
						<h2 class="text-2xl font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Share links</h2>
						<p class="mt-1 text-sm text-zinc-400">Send this link to your guests.</p>

						<div class="mt-4 space-y-4 rounded-xl border border-zinc-800 bg-[#1A1A22] px-5 py-4">
							<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500" style="font-family: 'Space Mono', monospace;">Guest invite</p>
							<p class="break-all text-sm text-white" style="font-family: 'Space Mono', monospace;">{invite}</p>
							<button
								type="button"
								disabled={copyingTarget === 'invite'}
								class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-xs font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] disabled:opacity-60"
								onclick={() => copyShareLink(invite, 'Invite link copied', 'invite')}
							>
								{copyingTarget === 'invite' ? 'Copying...' : inviteCopied ? 'Copied' : 'Copy invite link'}
							</button>
						</div>

						{#if debugInvite}
							<div class="mt-4 space-y-3 rounded-xl border border-violet-500/35 bg-violet-500/10 px-5 py-4">
								<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300" style="font-family: 'Space Mono', monospace;">Test access</p>
								<p class="break-all text-xs text-zinc-200" style="font-family: 'Space Mono', monospace;">{debugInvite}</p>
								<button
									type="button"
									disabled={copyingTarget === 'debug'}
									class="inline-flex h-8 items-center justify-center rounded-lg border border-violet-500/45 bg-transparent px-3 text-xs font-semibold text-violet-200 transition hover:text-white disabled:opacity-60"
									onclick={() => copyShareLink(debugInvite, 'Test link copied', 'debug')}
								>
									{copyingTarget === 'debug' ? 'Copying...' : debugInviteCopied ? 'Copied' : 'Copy test link'}
								</button>
							</div>
						{/if}
					</section>

					<div class="space-y-5">
						<section class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
							<div class="flex items-center justify-between gap-3">
								<h2 class="text-xl font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Capacity</h2>
								<p class="text-xs text-zinc-400" style="font-family: 'Space Mono', monospace;">
									{shareReservation.claimedCount}/{shareReservation.capacity} spots claimed
								</p>
							</div>
							<div class="mt-3 h-1.5 w-full rounded bg-[#1A1A22]">
								<div
									class="h-1.5 rounded bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
									style={`width:${shareCapacityBarWidth}%`}
								></div>
							</div>
							<div class="mt-3 flex items-center justify-between gap-2 text-xs" style="font-family: 'Space Mono', monospace;">
								<p class="font-semibold text-lime-300">{shareSpotsLeft} spots left</p>
								<p class="text-zinc-500">{shareReservation.declinedCount} declined</p>
							</div>
						</section>

						<section class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6">
							<h2 class="text-xl font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Scan invite</h2>
							<p class="mt-1 text-sm text-zinc-400">Guests can scan this QR code to open the invite page.</p>
							<div class="mt-4 flex justify-center">
								{#if inviteQrLoading}
									<div class="h-40 w-40 animate-pulse rounded-xl border border-zinc-700 bg-zinc-800"></div>
								{:else if inviteQrDataUrl}
									<img
										src={inviteQrDataUrl}
										alt="QR code for reservation invite link"
										class="h-40 w-40 rounded-xl border border-zinc-700 bg-white p-2"
									/>
								{:else}
									<div class="flex h-40 w-40 items-center justify-center rounded-xl border border-zinc-700 bg-white">
										<QrCodeIcon class="h-16 w-16 text-zinc-700" />
									</div>
								{/if}
							</div>
							<p class="mt-3 text-center text-xs italic text-zinc-500">Best for at-door scan and quick guest access.</p>
						</section>

						<section class="space-y-2">
							<a
								href={invite}
								class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]"
								style="font-family: 'Space Grotesk', sans-serif;"
							>
								Open guest page
							</a>
							<a
								href={`/r/${shareReservationId}/host`}
								class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-violet-500/55 bg-transparent px-4 text-sm font-bold text-violet-300 transition hover:text-white"
								style="font-family: 'Space Grotesk', sans-serif;"
							>
								Open host hub
							</a>
							<a
								href={`/r/${shareReservationId}/checkin`}
								class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-zinc-700 bg-transparent px-4 text-sm font-bold text-zinc-300 transition hover:text-white"
								style="font-family: 'Space Grotesk', sans-serif;"
							>
								Open door check-in
							</a>
							<a
								href="/event"
								class="inline-flex h-9 w-full items-center justify-center text-sm font-semibold text-zinc-500 transition hover:text-zinc-300"
							>
								Browse events
							</a>
						</section>
					</div>
				</div>
			{:else}
				<div class="rounded-2xl border border-zinc-800 bg-[#14141A] p-6 text-zinc-300">
					<p class="font-semibold text-white">Reservation not found.</p>
					<p class="mt-1 text-sm">Open an event to book a table and start again.</p>
					<a
						class="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-violet-500/50 hover:text-white"
						href="/event"
					>
						Browse events
					</a>
				</div>
			{/if}
		</section>
	{:else}
		<section class="mx-auto w-full max-w-[920px]">
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-violet-500/10 px-4 py-1.5">
					<Plus class="h-3 w-3 text-violet-400" aria-hidden="true" />
					<span class="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-400">
						New reservation
					</span>
				</div>
				<h1 class="font-display text-3xl font-extrabold text-white sm:text-4xl">Create a reservation</h1>
			</div>

			<form
				class="mt-7 space-y-6 rounded-[20px] border border-zinc-800 bg-[#14141A] p-5 sm:p-8"
				onsubmit={handleCreateReservation}
			>
				<div class="space-y-2">
					<label for="clubName" class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
						Club name
					</label>
					<input
						id="clubName"
						type="text"
						bind:value={form.clubName}
						placeholder="Nebula Room - Downtown"
						class="h-12 w-full rounded-xl border border-zinc-800 bg-[#1A1A22] px-4 text-[15px] font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-500/55"
					/>
					{#if fieldErrors.clubName}
						<p class="text-xs text-red-300">{fieldErrors.clubName}</p>
					{/if}
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<label for="startAt" class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
							Start at
						</label>
						<div class="relative">
							<input
								id="startAt"
								type="datetime-local"
								class="datetime-input h-12 w-full rounded-xl border border-zinc-800 bg-[#1A1A22] px-4 pr-11 text-[15px] font-medium text-white outline-none transition focus:border-violet-500/55"
								bind:value={form.startAt}
								oninput={() => {
									activeStartPreset = null;
								}}
							/>
							<Calendar
								class="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
								aria-hidden="true"
							/>
						</div>
						{#if fieldErrors.startAt}
							<p class="text-xs text-red-300" aria-live="polite">{fieldErrors.startAt}</p>
						{:else if startAtError}
							<p class="text-xs text-red-300" aria-live="polite">{startAtError}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<label for="tableType" class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
							Table type
						</label>
						<div class="relative">
							<select
								id="tableType"
								bind:value={form.tableType}
								class="h-12 w-full appearance-none rounded-xl border border-zinc-800 bg-[#1A1A22] px-4 pr-11 text-[15px] font-medium text-white outline-none transition focus:border-violet-500/55"
							>
								<option value="" disabled>Select a section</option>
								{#each TABLE_TYPE_OPTIONS as option}
									<option value={option}>{option}</option>
								{/each}
							</select>
							<LayoutGrid
								class="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
								aria-hidden="true"
							/>
						</div>
						{#if fieldErrors.tableType}
							<p class="text-xs text-red-300">{fieldErrors.tableType}</p>
						{/if}
					</div>
				</div>

				<div class="flex flex-wrap gap-2.5">
					<button
						type="button"
						class={startPresetButtonClass('plus2h')}
						onclick={() => applyStartPreset('plus2h')}
					>
						+2 hours
					</button>
					<button
						type="button"
						class={startPresetButtonClass('tonight')}
						onclick={() => applyStartPreset('tonight')}
					>
						Tonight 10 PM
					</button>
					<button
						type="button"
						class={startPresetButtonClass('tomorrow10')}
						onclick={() => applyStartPreset('tomorrow10')}
					>
						Tomorrow 10 PM
					</button>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<label for="capacity" class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
							Capacity
						</label>
						<div class="flex h-12 overflow-hidden rounded-xl border border-zinc-800 bg-[#1A1A22]">
							<button
								type="button"
								class="inline-flex h-full w-12 items-center justify-center border-r border-zinc-800 text-violet-400 transition hover:text-violet-300 disabled:cursor-not-allowed disabled:text-zinc-600"
								onclick={() => stepCapacity(-1)}
								disabled={form.capacity <= 1}
								aria-label="Decrease capacity"
							>
								<Minus class="h-4 w-4" aria-hidden="true" />
							</button>
							<input
								id="capacity"
								type="number"
								min={1}
								max={100}
								bind:value={form.capacity}
								onblur={normalizeCapacity}
								class="number-input-clean h-full w-full bg-transparent px-3 text-center font-display text-lg font-bold text-white outline-none"
							/>
							<button
								type="button"
								class="inline-flex h-full w-12 items-center justify-center border-l border-zinc-800 text-violet-400 transition hover:text-violet-300 disabled:cursor-not-allowed disabled:text-zinc-600"
								onclick={() => stepCapacity(1)}
								disabled={form.capacity >= 100}
								aria-label="Increase capacity"
							>
								<Plus class="h-4 w-4" aria-hidden="true" />
							</button>
						</div>
						<p class="text-xs text-zinc-500">Set a value between 1 and 100 guests.</p>
						{#if fieldErrors.capacity}
							<p class="text-xs text-red-300">{fieldErrors.capacity}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<label for="dressCode" class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
							Dress code (optional)
						</label>
						<input
							id="dressCode"
							type="text"
							bind:value={form.dressCode}
							placeholder="Upscale nightlife attire"
							class="h-12 w-full rounded-xl border border-zinc-800 bg-[#1A1A22] px-4 text-[15px] font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-500/55"
						/>
						{#if fieldErrors.dressCode}
							<p class="text-xs text-red-300">{fieldErrors.dressCode}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<label for="notes" class="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
						Notes
					</label>
					<textarea
						id="notes"
						bind:value={form.notes}
						placeholder="Arrival instructions, host notes, or welcome copy..."
						class="h-28 w-full resize-none rounded-xl border border-zinc-800 bg-[#1A1A22] px-4 py-3 text-[15px] font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-500/55"
					></textarea>
					{#if fieldErrors.notes}
						<p class="text-xs text-red-300">{fieldErrors.notes}</p>
					{/if}
				</div>

				{#if !productionLike}
					<div class="border-b border-zinc-800"></div>
					<div class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-[#1A1A22] px-5 py-4">
						<div class="min-w-0">
							<p class="font-display text-sm font-semibold text-white">Enable quick test access</p>
							<p class="mt-1 text-xs text-zinc-400">Adds a local test sign-in link on the share screen.</p>
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={form.debugEnabled}
							aria-label="Toggle quick test access"
							class={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
								form.debugEnabled
									? 'border-violet-400/60 bg-violet-500/85'
									: 'border-zinc-700 bg-zinc-600'
							}`}
							onclick={() => {
								form.debugEnabled = !form.debugEnabled;
							}}
						>
							<span
								class={`h-[18px] w-[18px] rounded-full bg-white/90 transition-transform ${
									form.debugEnabled ? 'translate-x-5' : 'translate-x-[2px]'
								}`}
							></span>
						</button>
					</div>
				{/if}

				{#if globalError}
					<p class="state-panel-error" aria-live="polite">
						{globalError}
					</p>
				{/if}

				<div class="space-y-2">
					<button
						type="submit"
						disabled={!canSubmitCreate}
						class="inline-flex h-12 w-full items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 font-display text-base font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
					>
						{isSubmitting ? 'Creating reservation...' : 'Create reservation'}
					</button>
					{#if !canSubmitCreate && !isSubmitting}
						<p class="text-xs text-zinc-500">Fill all required fields to enable reservation creation.</p>
					{/if}
				</div>
			</form>
		</section>
	{/if}
</main>
