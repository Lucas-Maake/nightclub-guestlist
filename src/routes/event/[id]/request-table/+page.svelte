<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input, Label } from '$lib/components/ui/input';
	import type { EventCatalogItem } from '$lib/data/events';
	import { currentUser, signOutCurrentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { getPublishedEventById, submitTableRequest } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { cn } from '$lib/utils/cn';
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

	function eventDateLine(event: EventCatalogItem): string {
		const start = new Date(event.startAt);
		const end = new Date(event.endAt);
		return `${dateLineFormatter.format(start)} at ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function digitsOnly(value: string): string {
		return value.replace(/\D/g, '');
	}

	function toUsPhoneDisplay(value: string): string {
		const digits = digitsOnly(value).slice(0, 10);
		if (digits.length <= 3) {
			return digits;
		}
		if (digits.length <= 6) {
			return `${digits.slice(0, 3)} ${digits.slice(3)}`;
		}
		return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
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

	async function handleSignIn(): Promise<void> {
		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		await openAuthModal({ returnTo, source: 'event-request-table-header' });
	}

	async function handleSignOut(): Promise<void> {
		await signOutCurrentUser();
		await goto('/');
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';

		if (!eventRecord) {
			errorMessage = 'Event not found.';
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
		if (!$currentUser) {
			return;
		}

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

<main class="app-shell py-6 sm:py-8">
	<section class="mx-auto w-full max-w-[620px] space-y-6">
		<div class="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
			<a class="inline-flex items-center gap-2 text-foreground no-underline" href="/event">
				<BrandMark class="h-4 w-4" />
				<span class="text-sm font-semibold">Events</span>
			</a>
			{#if $currentUser}
				<Button variant="outline" size="sm" onclick={handleSignOut}>Sign out</Button>
			{:else}
				<Button variant="outline" size="sm" onclick={handleSignIn}>Sign in</Button>
			{/if}
		</div>

		{#if loadingEvent}
			<div class="state-panel-muted">
				<p class="font-medium text-foreground">Loading event...</p>
			</div>
		{:else if !eventRecord}
			<div class="state-panel-muted">
				<p class="font-medium text-foreground">Event not found.</p>
				<p class="mt-1 text-sm">This event may have moved or is no longer available.</p>
				<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')} href="/event">
					Back to events
				</a>
			</div>
		{:else if submittedRequestId}
			<div class="space-y-4 rounded-2xl border border-success/35 bg-success/10 p-5">
				<p class="text-sm font-semibold uppercase tracking-wide text-success">Request submitted</p>
				<p class="text-sm text-foreground">
					Thanks, we received your table request for {eventRecord.title}. A member of the team will contact you
					soon.
				</p>
				<p class="text-xs text-muted-foreground">Reference ID: {submittedRequestId}</p>
				<div class="flex flex-wrap gap-2">
					<a class={cn(buttonVariants({ size: 'sm' }))} href={`/event/${eventRecord.id}`}>Back to event</a>
					<a class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href="/event">Browse events</a>
				</div>
			</div>
		{:else}
			<div class="space-y-5">
				<div class="space-y-1">
					<p class="text-4xl font-semibold uppercase tracking-tight">{eventRecord.posterHeadline}</p>
					<p class="text-sm text-muted-foreground">{eventDateLine(eventRecord)} &bull; {eventRecord.venue}</p>
				</div>

				<div class="space-y-3 border-t border-border/70 pt-5">
					<h1 class="text-4xl font-semibold tracking-tight">Request A Table</h1>
					<p class="max-w-2xl text-sm text-muted-foreground">
						Please enter your contact information and verify your phone number. An account will be created
						for you in order to track your request. A member of our team will contact you if a table becomes
						available. <span class="font-semibold text-destructive-foreground">This is not a confirmed booking.</span>
					</p>
				</div>

				<form class="space-y-4 border-t border-border/70 pt-5" onsubmit={handleSubmit}>
					<div class="space-y-2">
						<Label for="firstName">First Name *</Label>
						<Input
							id="firstName"
							placeholder="First Name"
							bind:value={form.firstName}
							disabled={submitting}
						/>
					</div>

					<div class="space-y-2">
						<Label for="lastName">Last Name *</Label>
						<Input
							id="lastName"
							placeholder="Last Name"
							bind:value={form.lastName}
							disabled={submitting}
						/>
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
						<div class="flex h-12 items-center overflow-hidden rounded-lg border border-input bg-background/30">
							<span class="px-3 text-sm text-foreground">US (+1)</span>
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
									form.phone = toUsPhoneDisplay(target.value);
								}}
							/>
						</div>
					</div>

					{#if errorMessage}
						<p class="state-panel-error" aria-live="polite">{errorMessage}</p>
					{/if}

					<Button class="w-full" size="lg" type="submit" disabled={submitting}>
						{submitting ? 'Submitting...' : 'Continue'}
					</Button>
				</form>
			</div>
		{/if}
	</section>
</main>
