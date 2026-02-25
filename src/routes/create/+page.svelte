<script lang="ts">
import { afterNavigate, goto } from '$app/navigation';
import { page } from '$app/stores';
import { onDestroy, onMount } from 'svelte';
import { Minus, Plus } from 'lucide-svelte';
import QRCode from 'qrcode';
import AppHeader from '$lib/components/common/app-header.svelte';
import CapacityMeter from '$lib/components/common/capacity-meter.svelte';
import ReservationPreviewCard from '$lib/components/common/reservation-preview-card.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input, Label } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createReservationSchema } from '$lib/schemas/reservation';
	import { createReservation, getReservationPublic } from '$lib/firebase/firestore';
	import {
		getCurrentUser,
		signInAnonymouslyForDebug,
		waitForAuthReady,
		currentUser
	} from '$lib/firebase/auth';
	import type { CreateReservationInput, ReservationPublicRecord } from '$lib/types/models';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { toUserSafeCreateMessage } from '$lib/utils/messages';
	import { canUseDebugMode, isProductionLikeRuntime } from '$lib/utils/security';
	import { inviteDebugUrl, inviteUrl } from '$lib/utils/links';
	import { cn } from '$lib/utils/cn';

type FormState = CreateReservationInput;
type StartPreset = 'plus2h' | 'tonight' | 'tomorrow10';

const now = new Date();
now.setHours(now.getHours() + 3, 0, 0, 0);
const productionLike = isProductionLikeRuntime();

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

	function toDateTimeInput(date: Date): string {
		const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
	}

	function parseUrlState(): { reservationId: string; debugToken: string } {
		const reservationId = $page.url.searchParams.get('reservationId') ?? '';
		const debugToken = $page.url.searchParams.get('debug') ?? '';
		return { reservationId, debugToken };
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
	const next = new Date(current);

	if (preset === 'plus2h') {
		next.setMinutes(0, 0, 0);
		next.setHours(next.getHours() + 2);
		return next;
	}

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

	onMount(async () => {
		await waitForAuthReady();
		await hydrateShareState();
	});

	afterNavigate(async () => {
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
				'Debug sign-in timed out. Check Firebase Auth config and network.'
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

	async function openCreateSignIn(): Promise<void> {
		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		await openAuthModal({ returnTo, source: 'create-page' });
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
				: 'Debug mode is blocked on this environment.';
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
				'Create reservation timed out. Check Firestore setup and network.'
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
		<section class="space-y-6">
			<div class="space-y-2">
				<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Share Screen</p>
				<h1 class="section-title">Invite is live</h1>
				<p class="section-lead">Copy the guest link and send it to your guests now.</p>
			</div>

			{#if shareLoading}
				<Card>
					<CardContent class="p-6">
						<p class="state-panel-muted" aria-live="polite">Loading invite preview...</p>
					</CardContent>
				</Card>
			{:else if shareReservation}
				<ReservationPreviewCard reservation={shareReservation} />

				<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
					<Card>
						<CardHeader>
							<CardTitle>Share links</CardTitle>
							<CardDescription>Send this link to your guests.</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="rounded-2xl border border-border/75 bg-secondary/30 p-4">
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Guest Invite</p>
								<p class="mt-2 break-all text-sm">{invite}</p>
								<Button
									class="mt-4"
									size="sm"
									disabled={copyingTarget === 'invite'}
									variant={inviteCopied ? 'success' : 'default'}
									onclick={() => copyShareLink(invite, 'Invite link copied', 'invite')}
								>
									{copyingTarget === 'invite' ? 'Copying...' : inviteCopied ? 'Copied' : 'Copy invite link'}
								</Button>
							</div>

							{#if debugInvite}
								<div class="rounded-2xl border border-primary/30 bg-primary/10 p-4">
									<p class="text-xs uppercase tracking-wide text-primary">Debug link</p>
									<p class="mt-2 break-all text-sm">{debugInvite}</p>
									<p class="mt-2 text-xs text-muted-foreground">
										Debug bypass is restricted to dev/allowlisted hosts only.
									</p>
									<Button
										class="mt-4"
										size="sm"
										disabled={copyingTarget === 'debug'}
										variant={debugInviteCopied ? 'success' : 'outline'}
										onclick={() => copyShareLink(debugInvite, 'Debug link copied', 'debug')}
									>
										{copyingTarget === 'debug' ? 'Copying...' : debugInviteCopied ? 'Copied' : 'Copy debug link'}
									</Button>
								</div>
							{/if}
						</CardContent>
					</Card>

					<div class="space-y-4">
						<CapacityMeter
							capacity={shareReservation.capacity}
							accepted={shareReservation.acceptedCount}
							declined={shareReservation.declinedCount}
						/>
						<Card>
							<CardHeader>
								<CardTitle>Scan invite</CardTitle>
								<CardDescription>Guests can scan this QR code to open the invite page.</CardDescription>
							</CardHeader>
							<CardContent class="space-y-3 p-4">
								{#if inviteQrLoading}
									<div class="mx-auto h-[210px] w-[210px] animate-pulse rounded-2xl border border-border/75 bg-secondary/35"></div>
								{:else if inviteQrDataUrl}
									<img
										src={inviteQrDataUrl}
										alt="QR code for reservation invite link"
										class="mx-auto h-[210px] w-[210px] rounded-2xl border border-border/75 bg-white p-2"
									/>
								{:else}
									<p class="state-panel-muted text-center">Unable to generate QR code right now.</p>
								{/if}
								<p class="text-center text-xs text-muted-foreground">
									Best for at-door scan and quick guest access.
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardContent class="space-y-3 p-4">
								<a class={cn(buttonVariants({ variant: 'default', size: 'md' }), 'w-full')} href={invite}>
									Open guest page
								</a>
								<a
									class={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'w-full')}
									href={`/r/${shareReservationId}/host`}
								>
									Open host hub
								</a>
								<a
									class={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'w-full')}
									href={`/r/${shareReservationId}/checkin`}
								>
									Open door check-in
								</a>
								<Separator class="my-1" />
								<a class={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'w-full')} href="/create">
									Create another reservation
								</a>
							</CardContent>
						</Card>
					</div>
				</div>
			{:else}
				<Card>
					<CardContent class="p-6">
						<div class="state-panel-muted">
							<p>Reservation not found. Create a new reservation to generate a share link.</p>
							<a class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mt-3')} href="/create">
								Create reservation
							</a>
						</div>
					</CardContent>
				</Card>
			{/if}
		</section>
	{:else}
		<section class="mx-auto max-w-3xl space-y-6">
			<div class="space-y-2">
				<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Host Flow</p>
				<h1 class="section-title">Create a reservation</h1>
				<p class="section-lead">Sign in to create reservations and manage your guest list.</p>
			</div>

			<Card>
				<CardContent class="p-6 sm:p-7">
					<form class="space-y-5" onsubmit={handleCreateReservation}>
						<div class="grid gap-5 sm:grid-cols-2">
							<div class="space-y-2 sm:col-span-2">
								<Label for="clubName">Club name</Label>
								<Input id="clubName" bind:value={form.clubName} placeholder="Nebula Room - Downtown" />
								{#if fieldErrors.clubName}
									<p class="text-xs text-destructive-foreground">{fieldErrors.clubName}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="startAt">Start at</Label>
								<Input id="startAt" type="datetime-local" class="datetime-input" bind:value={form.startAt} />
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
										onclick={() => applyStartPreset('plus2h')}
									>
										+2 hours
									</button>
									<button
										type="button"
										class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
										onclick={() => applyStartPreset('tonight')}
									>
										Tonight 10 PM
									</button>
									<button
										type="button"
										class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
										onclick={() => applyStartPreset('tomorrow10')}
									>
										Tomorrow 10 PM
									</button>
								</div>
								{#if startAtError}
									<p class="text-xs text-destructive-foreground" aria-live="polite">{startAtError}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="tableType">Table type</Label>
								<Input id="tableType" bind:value={form.tableType} placeholder="VIP Booth" />
								{#if fieldErrors.tableType}
									<p class="text-xs text-destructive-foreground">{fieldErrors.tableType}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="capacity">Capacity</Label>
								<div class="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="icon"
										onclick={() => stepCapacity(-1)}
										disabled={form.capacity <= 1}
										aria-label="Decrease capacity"
									>
										<Minus class="h-4 w-4" aria-hidden="true" />
									</Button>
									<Input
										id="capacity"
										type="number"
										min={1}
										max={100}
										class="number-input-clean text-center tabular-nums"
										bind:value={form.capacity}
										onblur={normalizeCapacity}
									/>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onclick={() => stepCapacity(1)}
										disabled={form.capacity >= 100}
										aria-label="Increase capacity"
									>
										<Plus class="h-4 w-4" aria-hidden="true" />
									</Button>
								</div>
								<p class="text-xs text-muted-foreground">Set a value between 1 and 100 guests.</p>
								{#if fieldErrors.capacity}
									<p class="text-xs text-destructive-foreground">{fieldErrors.capacity}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="dressCode">Dress code (optional)</Label>
								<Input id="dressCode" bind:value={form.dressCode} placeholder="Upscale evening attire" />
								{#if fieldErrors.dressCode}
									<p class="text-xs text-destructive-foreground">{fieldErrors.dressCode}</p>
								{/if}
							</div>

							<div class="space-y-2 sm:col-span-2">
								<Label for="notes">Notes</Label>
								<Textarea
									id="notes"
									bind:value={form.notes}
									placeholder="Arrival instructions, host notes, or welcome copy..."
								/>
								{#if fieldErrors.notes}
									<p class="text-xs text-destructive-foreground">{fieldErrors.notes}</p>
								{/if}
							</div>
						</div>

						{#if !productionLike}
							<div class="rounded-2xl border border-border/75 bg-secondary/25 p-4">
								<div class="flex items-start justify-between gap-4">
									<div class="space-y-1">
										<p class="text-sm font-medium text-foreground">Enable debug backdoor</p>
										<p class="text-xs text-muted-foreground">
											Stores only hashed debug token and enables `?debug=TOKEN` bypass in dev/allowlisted domains.
										</p>
									</div>
									<Switch
										checked={form.debugEnabled}
										on:toggle={(event) => {
											form.debugEnabled = event.detail;
										}}
									/>
								</div>
							</div>
						{/if}

						{#if globalError}
							<p class="state-panel-error" aria-live="polite">
								{globalError}
							</p>
						{/if}

						<div class="flex flex-wrap gap-3">
							<Button type="submit" disabled={!canSubmitCreate}>
								{isSubmitting ? 'Creating...' : canSubmitCreate ? 'Create reservation' : 'Complete required fields'}
							</Button>
							{#if !$currentUser}
								<button
									type="button"
									class={cn(buttonVariants({ variant: 'outline', size: 'md' }))}
									onclick={openCreateSignIn}
								>
									Sign in
								</button>
							{/if}
						</div>
						{#if !canSubmitCreate && !isSubmitting}
							<p class="text-xs text-muted-foreground">
								Fill all required fields to enable reservation creation.
							</p>
						{/if}
					</form>
				</CardContent>
			</Card>
		</section>
	{/if}
</main>
