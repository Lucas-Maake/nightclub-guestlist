<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { Input, Label } from '$lib/components/ui/input';
	import type { EventCatalogItem } from '$lib/data/events';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { getPublishedEventById, submitTableRequest } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { toUserSafeTableRequestMessage } from '$lib/utils/messages';

	type TableRequestForm = {
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
	};

	const dateLineFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const timeFormatter = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	});

	const eventId = $derived($page.params.id ?? '');

	let eventRecord = $state<EventCatalogItem | null>(null);
	let loadingEvent = $state(true);
	let submitting = $state(false);
	let submittedRequestId = $state('');
	let errorMessage = $state('');

	let form = $state<TableRequestForm>({
		firstName: '',
		lastName: '',
		email: '',
		phone: ''
	});
	let prefilled = $state(false);

	const tableRequestClosed = $derived.by(() => {
		if (!eventRecord) {
			return false;
		}

		const eventEnd = new Date(eventRecord.endAt).getTime();
		return Number.isFinite(eventEnd) ? eventEnd < Date.now() : false;
	});

	function eventDateLine(event: EventCatalogItem): string {
		const start = new Date(event.startAt);
		const end = new Date(event.endAt);
		return `${dateLineFormatter.format(start)} at ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function digitsOnly(value: string): string {
		return value.replace(/\D/g, '');
	}

	function toUsPhoneDisplay(value: string): string {
		let d = digitsOnly(value);
		// Strip US country code when present (e.g. +1XXXXXXXXXX → XXXXXXXXXX)
		if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
		d = d.slice(0, 10);
		if (d.length <= 3) return d;
		if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
		return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
	}

	function toUsPhoneE164(value: string): string | null {
		const digits = digitsOnly(value);
		if (digits.length === 10) {
			return `+1${digits}`;
		}
		if (digits.length === 11 && digits.startsWith('1')) {
			return `+${digits}`;
		}
		return null;
	}

	function splitDisplayName(value: string): { firstName: string; lastName: string } {
		const parts = value
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (parts.length === 0) {
			return { firstName: '', lastName: '' };
		}
		if (parts.length === 1) {
			return { firstName: parts[0], lastName: '' };
		}
		return {
			firstName: parts[0],
			lastName: parts.slice(1).join(' ')
		};
	}

	function validateForm(): string {
		if (!form.firstName.trim()) {
			return 'First name is required.';
		}
		if (!form.lastName.trim()) {
			return 'Last name is required.';
		}
		const email = form.email.trim().toLowerCase();
		if (!email) {
			return 'Email is required.';
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return 'Enter a valid email address.';
		}
		if (!toUsPhoneE164(form.phone)) {
			return 'Enter a valid US phone number.';
		}

		return '';
	}

	async function ensureSignedIn(): Promise<boolean> {
		if ($currentUser) {
			return true;
		}

		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		const authResult = await openAuthModal({ returnTo, source: 'event-request-table' });
		if (authResult !== 'authenticated') {
			errorMessage = 'Sign in is required to continue.';
			return false;
		}

		await waitForAuthReady();
		if (!$currentUser) {
			errorMessage = 'Sign in is required to continue.';
			return false;
		}

		return true;
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';

		if (!eventRecord) {
			errorMessage = 'Event not found.';
			return;
		}
		if (tableRequestClosed) {
			errorMessage = 'This event has ended. Table requests are closed.';
			return;
		}

		const validationError = validateForm();
		if (validationError) {
			errorMessage = validationError;
			return;
		}

		const signedIn = await ensureSignedIn();
		if (!signedIn) {
			return;
		}

		submitting = true;
		try {
			const result = await submitTableRequest({
				eventId: eventRecord.id,
				firstName: form.firstName.trim(),
				lastName: form.lastName.trim(),
				email: form.email.trim().toLowerCase(),
				phone: toUsPhoneE164(form.phone) ?? ''
			});
			submittedRequestId = result.requestId;

			pushToast({
				title: 'Request submitted',
				description: 'We received your table request and will contact you soon.',
				variant: 'success'
			});
		} catch (error) {
			errorMessage = toUserSafeTableRequestMessage(error);
		} finally {
			submitting = false;
		}
	}

	async function loadEventById(id: string): Promise<void> {
		loadingEvent = true;
		try {
			eventRecord = await getPublishedEventById(id);
		} catch {
			eventRecord = null;
		} finally {
			loadingEvent = false;
		}
	}

	onMount(async () => {
		await waitForAuthReady();
	});

	$effect(() => {
		if (!eventId) {
			eventRecord = null;
			loadingEvent = false;
			return;
		}

		void loadEventById(eventId);
	});

	$effect(() => {
		if (!$currentUser || prefilled) {
			return;
		}

		prefilled = true;

		if (!form.email && $currentUser.email) {
			form.email = $currentUser.email;
		}

		if (!form.phone && $currentUser.phoneNumber) {
			form.phone = toUsPhoneDisplay($currentUser.phoneNumber);
		}

		if (!form.firstName || !form.lastName) {
			const names = splitDisplayName($currentUser.displayName ?? '');
			if (!form.firstName && names.firstName) {
				form.firstName = names.firstName;
			}
			if (!form.lastName && names.lastName) {
				form.lastName = names.lastName;
			}
		}
	});
</script>

<div class="-mb-16 relative flex min-h-screen flex-col overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div
		class="pointer-events-none fixed inset-0 bg-[radial-gradient(55rem_38rem_at_-10%_-8%,rgb(77_171_254_/_0.22),transparent_55%),radial-gradient(48rem_28rem_at_95%_12%,rgb(34_211_238_/_0.12),transparent_55%),linear-gradient(180deg,#0a0a0f_0%,#0e0512_42%,#050507_100%)]"
	></div>

	<main class="relative z-10 flex min-h-screen flex-1 flex-col">
		<AppHeader />

		{#if loadingEvent}
			<div class="relative h-[280px] overflow-hidden border-b border-zinc-800 sm:h-[340px] skeleton-shimmer"></div>
			<section class="mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
				<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_460px]">
					<div class="order-2 space-y-5 lg:order-1">
						<div class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4 sm:p-5">
							<div class="h-8 w-48 rounded-lg skeleton-shimmer"></div>
							<div class="mt-3 h-4 w-full rounded skeleton-shimmer"></div>
							<div class="mt-2 h-4 w-5/6 rounded skeleton-shimmer"></div>
							<div class="mt-2 h-4 w-2/3 rounded skeleton-shimmer"></div>
							<div class="mt-2 h-3.5 w-1/2 rounded skeleton-shimmer"></div>
						</div>
						<div class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4">
							<div class="h-3 w-28 rounded skeleton-shimmer"></div>
							<div class="mt-3 h-3.5 w-3/4 rounded skeleton-shimmer"></div>
							<div class="mt-2 h-3.5 w-2/3 rounded skeleton-shimmer"></div>
							<div class="mt-2 h-3.5 w-1/2 rounded skeleton-shimmer"></div>
						</div>
					</div>
					<div class="order-1 rounded-2xl border border-zinc-800 bg-zinc-900/88 p-4 sm:p-5 lg:order-2">
						{#each [1, 2, 3, 4] as _}
							<div class="mb-4 space-y-2">
								<div class="h-3.5 w-20 rounded skeleton-shimmer"></div>
								<div class="h-12 w-full rounded-lg skeleton-shimmer"></div>
							</div>
						{/each}
						<div class="mt-2 h-11 w-full rounded-lg skeleton-shimmer"></div>
					</div>
				</div>
			</section>
		{:else if !eventRecord}
			<section class="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8 lg:px-12">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
					<p class="font-semibold text-white">Event not found.</p>
					<p class="mt-1 text-sm">This event may have moved or is no longer available.</p>
					<a href="/event" class="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white">
						Back to events
					</a>
				</div>
			</section>
		{:else if submittedRequestId}
			<section class="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8 lg:px-12">
				<div class="space-y-4 rounded-2xl border border-sky-400/35 bg-sky-400/10 p-5 text-zinc-100">
					<p class="text-sm font-semibold uppercase tracking-wide text-sky-400" style="font-family: 'Space Mono', monospace;">
						Request submitted
					</p>
					<p class="text-sm">
						Thanks, we received your table request for {eventRecord.title}. A member of the team will contact
						you soon.
					</p>
					<p class="text-xs text-zinc-300">Reference ID: {submittedRequestId}</p>
					<div class="flex flex-wrap gap-2">
						<a href={`/event/${eventRecord.id}`} class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 px-4 text-sm font-bold text-white shadow-[0_0_20px_rgba(77,171,254,0.35)]">
							Back to event
						</a>
						<a href="/event" class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm font-bold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white">
							Browse events
						</a>
					</div>
				</div>
			</section>
		{:else}
			<section in:fly={{ y: 16, duration: 340, easing: cubicOut }} class="relative h-[280px] overflow-hidden border-b border-zinc-800 sm:h-[340px]">
				{#if eventRecord.posterImageUrl}
					<img
						src={eventRecord.posterImageUrl}
						alt={`Poster for ${eventRecord.title}`}
						class="absolute inset-0 h-full w-full object-cover"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<div class={`absolute inset-0 ${eventRecord.posterClass}`}></div>
				{/if}
				<div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,7,0.18)_0%,rgba(5,5,7,0.72)_58%,rgba(5,5,7,0.98)_100%)]"></div>
				<div class="absolute inset-x-0 bottom-0">
					<div class="mx-auto w-full max-w-[1200px] px-5 pb-6 sm:px-8 lg:px-12">
						<p class="text-[11px] uppercase tracking-[0.12em] text-blue-300" style="font-family: 'Space Mono', monospace;">Table request</p>
						<p class="mt-2 text-4xl font-black uppercase leading-[0.88] tracking-tight text-white sm:text-5xl" style="font-family: 'Space Grotesk', sans-serif;">
							{eventRecord.posterHeadline}
						</p>
						<p class="mt-2 text-sm text-zinc-200">{eventDateLine(eventRecord)} - {eventRecord.venue}</p>
					</div>
				</div>
			</section>

			<section class="mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
				<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_460px]">
					<div class="order-2 space-y-5 lg:order-1">
						<div in:fly={{ y: 14, duration: 300, delay: 60, easing: cubicOut }} class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4 sm:p-5">
							<h1 class="text-3xl font-semibold tracking-tight text-white sm:text-4xl" style="font-family: 'Space Grotesk', sans-serif;">
								Request A Table
							</h1>
							<p class="mt-3 text-sm leading-6 text-zinc-300">
								Please enter your contact information and verify your phone number. An account will be
								created for you in order to track your request. A member of our team will contact you if a
								table becomes available.
							</p>
							<p class="mt-2 text-sm font-semibold text-rose-200">This is not a confirmed booking.</p>
						</div>

						<div in:fly={{ y: 14, duration: 300, delay: 120, easing: cubicOut }} class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4">
							<p class="text-[11px] uppercase tracking-[0.12em] text-blue-300" style="font-family: 'Space Mono', monospace;">Booking context</p>
							<p class="mt-3 text-sm text-zinc-300">
								Event: <span class="font-semibold text-white">{eventRecord.title}</span>
							</p>
							<p class="mt-1 text-sm text-zinc-300">
								Venue: <span class="font-semibold text-white">{eventRecord.venue}</span>
							</p>
							<p class="mt-1 text-sm text-zinc-300">
								Dress code: <span class="font-semibold text-white">{eventRecord.dressCode}</span>
							</p>
						</div>
					</div>

					<form in:fly={{ y: 14, duration: 300, delay: 30, easing: cubicOut }} class="order-1 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/88 p-4 sm:p-5 lg:order-2" onsubmit={handleSubmit}>
						<div class="space-y-2">
							<Label for="firstName">First Name *</Label>
							<Input id="firstName" placeholder="First Name" bind:value={form.firstName} disabled={submitting} />
						</div>

						<div class="space-y-2">
							<Label for="lastName">Last Name *</Label>
							<Input id="lastName" placeholder="Last Name" bind:value={form.lastName} disabled={submitting} />
						</div>

						<div class="space-y-2">
							<Label for="email">Email *</Label>
							<Input
								id="email"
								type="email"
								inputmode="email"
								autocomplete="email"
								placeholder="Email"
								bind:value={form.email}
								disabled={submitting}
							/>
						</div>

						<div class="space-y-2">
							<Label for="phone">Phone Number *</Label>
							<div class="flex h-12 items-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950/50">
								<span class="px-3 text-sm text-zinc-200">US (+1)</span>
								<Input
									id="phone"
									type="tel"
									inputmode="tel"
									autocomplete="tel"
									placeholder="201 555 0123"
									class="h-full border-0 bg-transparent ring-0 focus-visible:ring-0"
									value={form.phone}
									disabled={submitting}
									oninput={(event: Event) => {
										const target = event.currentTarget as HTMLInputElement;
										const cursor = target.selectionStart ?? target.value.length;
										const oldLen = target.value.length;
										const formatted = toUsPhoneDisplay(target.value);
										form.phone = formatted;
										tick().then(() => {
											const delta = formatted.length - oldLen;
											const pos = Math.max(0, cursor + delta);
											target.setSelectionRange(pos, pos);
										});
									}}
								/>
							</div>
						</div>

						{#if errorMessage}
							<p class="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" aria-live="polite">
								{errorMessage}
							</p>
						{/if}
						{#if tableRequestClosed}
							<p class="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" aria-live="polite">
								This event has ended. Table requests are closed.
							</p>
						{/if}

						<button
							class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 px-4 text-sm font-bold text-white shadow-[0_0_22px_rgba(77,171,254,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
							type="submit"
							disabled={submitting || tableRequestClosed}
						>
							{submitting ? 'Submitting...' : tableRequestClosed ? 'Requests closed' : 'Continue'}
						</button>
					</form>
				</div>
			</section>
		{/if}
	</main>

	<footer class="relative z-10 w-full border-t border-zinc-800/50 bg-[#0e0e12]">
		<div class="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
			<span class="text-xs text-zinc-500">(c) 2026 Apollo HQ</span>
			<span class="text-xs text-zinc-600">All rights reserved.</span>
		</div>
	</footer>
</div>
