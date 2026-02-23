<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
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
	import { pushToast } from '$lib/stores/toast';
	import { canUseDebugMode } from '$lib/utils/security';
	import { inviteDebugUrl, inviteUrl } from '$lib/utils/links';
	import { cn } from '$lib/utils/cn';

	type FormState = CreateReservationInput;

	const now = new Date();
	now.setHours(now.getHours() + 3, 0, 0, 0);

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
		shareDebugToken = debugToken;

		if (!reservationId) {
			shareReservation = null;
			return;
		}

		shareLoading = true;
		shareReservation = await getReservationPublic(reservationId);
		shareLoading = false;
	}

	onMount(async () => {
		await waitForAuthReady();
		await hydrateShareState();
	});

	afterNavigate(async () => {
		await hydrateShareState();
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

	function formatCreateError(error: unknown): string {
		if (!(error instanceof Error)) {
			return 'Unable to create reservation.';
		}

		const message = error.message;
		if (
			message.includes('firestore.googleapis.com') ||
			message.includes('Cloud Firestore API has not been used') ||
			message.includes('SERVICE_DISABLED')
		) {
			return 'Cloud Firestore is not enabled for this Firebase project. Enable Firestore in Firebase Console and Cloud Firestore API in Google Cloud, then retry.';
		}

		return message;
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

		return null;
	}

	async function handleCreateReservation(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		resetErrors();
		isSubmitting = true;

		const parsed = createReservationSchema.safeParse(form);
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
			globalError = 'Debug mode is blocked on production hostnames.';
			isSubmitting = false;
			return;
		}

		try {
			const uid = await ensureCreateUser(parsed.data.debugEnabled);
			if (!uid) {
				const returnTo = encodeURIComponent('/create');
				await goto(`/login?returnTo=${returnTo}`);
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
			globalError = formatCreateError(error);
		} finally {
			isSubmitting = false;
		}
	}

	async function copyText(value: string, successLabel: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			pushToast({
				title: successLabel,
				description: value,
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

	const invite = $derived(shareReservationId ? inviteUrl(shareReservationId) : '');
	const debugInvite = $derived(
		shareReservationId && shareDebugToken ? inviteDebugUrl(shareReservationId, shareDebugToken) : ''
	);
</script>

<AppHeader />

<main class="app-shell py-6 sm:py-10">
	{#if shareReservationId}
		<section class="space-y-6">
			<div class="space-y-2">
				<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Share Screen</p>
				<h1 class="section-title">Invite is live</h1>
				<p class="section-lead">Copy the guest link and send it immediately.</p>
			</div>

			{#if shareLoading}
				<Card>
					<CardContent class="p-6">
						<p class="text-sm text-muted-foreground">Loading invite preview...</p>
					</CardContent>
				</Card>
			{:else if shareReservation}
				<ReservationPreviewCard reservation={shareReservation} />

				<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
					<Card>
						<CardHeader>
							<CardTitle>Share links</CardTitle>
							<CardDescription>
								Standard HTTPS links only. No dynamic-link dependency.
							</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="rounded-2xl border border-border/75 bg-secondary/30 p-4">
								<p class="text-xs uppercase tracking-wide text-muted-foreground">Guest Invite</p>
								<p class="mt-2 break-all text-sm">{invite}</p>
								<Button class="mt-4" size="sm" onclick={() => copyText(invite, 'Invite link copied')}>
									Copy invite link
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
										variant="outline"
										onclick={() => copyText(debugInvite, 'Debug link copied')}
									>
										Copy debug link
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
						<p class="text-sm text-muted-foreground">
							Reservation not found. Create a new reservation to generate a share link.
						</p>
					</CardContent>
				</Card>
			{/if}
		</section>
	{:else}
		<section class="mx-auto max-w-3xl space-y-6">
			<div class="space-y-2">
				<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Host Flow</p>
				<h1 class="section-title">Create a reservation</h1>
				<p class="section-lead">
					Hosts must be authenticated with OTP. For safe local QA, debug mode can bypass OTP on allowlisted domains.
				</p>
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
								<Input id="startAt" type="datetime-local" bind:value={form.startAt} />
								{#if fieldErrors.startAt}
									<p class="text-xs text-destructive-foreground">{fieldErrors.startAt}</p>
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
								<Input id="capacity" type="number" min={1} max={100} bind:value={form.capacity} />
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

						{#if globalError}
							<p class="rounded-2xl border border-destructive/35 bg-destructive/15 px-4 py-3 text-sm text-destructive-foreground">
								{globalError}
							</p>
						{/if}

						<div class="flex flex-wrap gap-3">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? 'Creating...' : 'Create reservation'}
							</Button>
							{#if !$currentUser}
								<a
									class={cn(buttonVariants({ variant: 'outline', size: 'md' }))}
									href="/login?returnTo=%2Fcreate"
								>
									Login with phone OTP
								</a>
							{/if}
						</div>
					</form>
				</CardContent>
			</Card>
		</section>
	{/if}
</main>
