<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { MapPinned } from 'lucide-svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { QuantitySelect } from '$lib/components/ui/quantity-select';
	import type { EventCatalogItem } from '$lib/data/events';
	import { currentUser, signOutCurrentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { getPublishedEventById } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { cn } from '$lib/utils/cn';

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
	const currencyFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});

	const eventId = $derived($page.params.id ?? '');

	let eventRecord = $state<EventCatalogItem | null>(null);
	let loadingEvent = $state(true);

	let quantities = $state<Record<string, number>>({});

	const subtotalCents = $derived.by(() => {
		if (!eventRecord) {
			return 0;
		}

		return eventRecord.ticketTiers.reduce((total, tier) => {
			const quantity = quantities[tier.id] ?? 0;
			return total + tier.priceCents * quantity;
		}, 0);
	});

	const selectedTicketCount = $derived.by(() => {
		if (!eventRecord) {
			return 0;
		}

		return eventRecord.ticketTiers.reduce((count, tier) => count + (quantities[tier.id] ?? 0), 0);
	});

	function startDate(): Date | null {
		return eventRecord ? new Date(eventRecord.startAt) : null;
	}

	function endDate(): Date | null {
		return eventRecord ? new Date(eventRecord.endAt) : null;
	}

	function eventDateLine(): string {
		const start = startDate();
		const end = endDate();
		if (!start || !end) {
			return '';
		}

		return `${dateLineFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function formatPrice(cents: number): string {
		return currencyFormatter.format(cents / 100);
	}

	function quantityOptions(maxPerOrder: number): number[] {
		return Array.from({ length: maxPerOrder + 1 }, (_, index) => index);
	}

	function updateTicketQuantity(tierId: string, value: string | number): void {
		const parsed = Number(value);
		const tier = eventRecord?.ticketTiers.find((candidate) => candidate.id === tierId);
		const maxPerOrder = tier?.maxPerOrder ?? 0;
		const safeValue = Number.isFinite(parsed)
			? Math.min(maxPerOrder, Math.max(0, Math.floor(parsed)))
			: 0;
		quantities = {
			...quantities,
			[tierId]: safeValue
		};
	}

	async function handleSignIn(): Promise<void> {
		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		await openAuthModal({ returnTo, source: 'event-detail' });
	}

	async function handleSignOut(): Promise<void> {
		await signOutCurrentUser();
		await goto('/');
	}

	async function handleBookTable(): Promise<void> {
		if (!eventRecord) {
			return;
		}

		if (!$currentUser) {
			const returnTo = `${$page.url.pathname}${$page.url.search}`;
			const authResult = await openAuthModal({ returnTo, source: 'event-detail-book' });
			if (authResult !== 'authenticated') {
				return;
			}
		}

		const params = new URLSearchParams({
			eventId: eventRecord.id,
			clubName: eventRecord.venue,
			startAt: eventRecord.startAt,
			tableType: eventRecord.defaultTableType,
			notes: `${eventRecord.title} - table request from event detail page.`,
			dressCode: eventRecord.dressCode
		});
		await goto(`/create?${params.toString()}`);
	}

	function handleRequestTablePlaceholder(): void {
		pushToast({
			title: 'Table requests',
			description: 'Use the Book a table button below to continue.',
			variant: 'default'
		});
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
			quantities = {};
			return;
		}

		quantities = {};
		void loadEventById(eventId);
	});
</script>

<main class="app-shell pb-28 pt-6 sm:pb-32 sm:pt-8">
	<section class="mx-auto w-full max-w-[520px] space-y-4">
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
		{:else}
			<div class="space-y-4">
				<div class={cn('relative min-h-[330px] overflow-hidden rounded-2xl border border-border/70 p-4 sm:min-h-[380px]', eventRecord.posterClass)}>
					<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/12 to-black/75"></div>
					<div class="absolute bottom-4 left-4 right-4 z-10 space-y-2 text-left">
						<p class="text-xs uppercase tracking-[0.2em] text-white/75">{eventRecord.venue}</p>
						<p class="text-5xl font-black uppercase leading-[0.85] tracking-tight text-white/88">
							{eventRecord.posterHeadline}
						</p>
						<p class="text-base text-white/85">{eventRecord.location}</p>
					</div>
				</div>

				<div class="space-y-2 border-b border-border/70 pb-4">
					<h1 class="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-[2.65rem]">{eventRecord.title}</h1>
					<p class="text-sm font-medium text-foreground">{eventRecord.venue}</p>
					<p class="text-sm text-primary">{eventDateLine()}</p>
				</div>

				<div class="space-y-3 border-b border-border/70 pb-5">
					<p class="text-sm font-semibold text-foreground">Admission</p>
					{#each eventRecord.ticketTiers as tier (tier.id)}
						<div class="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-secondary/20 px-3 py-3">
							<div>
								<p class="text-sm font-medium">{tier.label}</p>
								<p class="text-xs text-muted-foreground">{formatPrice(tier.priceCents)}</p>
							</div>
							<div class="flex items-center gap-3">
								<p class="text-sm font-semibold text-primary">{formatPrice(tier.priceCents)}</p>
								<QuantitySelect
									ariaLabel={`Select ${tier.label} quantity`}
									options={quantityOptions(tier.maxPerOrder)}
									value={quantities[tier.id] ?? 0}
									on:change={(event) => updateTicketQuantity(tier.id, event.detail.value)}
								/>
							</div>
						</div>
					{/each}
					<div class="flex items-center justify-between text-sm">
						<p class="text-muted-foreground">
							{selectedTicketCount} ticket{selectedTicketCount === 1 ? '' : 's'} selected
						</p>
						<p class="font-semibold">{formatPrice(subtotalCents)}</p>
					</div>
				</div>

				<div class="space-y-3 border-b border-border/70 pb-5">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-sm font-semibold text-foreground">Looking for a VIP table?</p>
							<p class="text-xs text-muted-foreground">Send us a custom table request.</p>
						</div>
						<Button size="sm" onclick={handleRequestTablePlaceholder}>Request</Button>
					</div>
				</div>

				<div class="space-y-3 border-b border-border/70 pb-5">
					<p class="text-sm font-semibold text-foreground">Event details</p>
					<p class="text-sm text-muted-foreground">{eventRecord.description}</p>
					<p class="text-xs text-muted-foreground">
						By joining this event or booking a table, you agree to receive event updates related to access,
						entry, and operational changes.
					</p>
				</div>

				<div class="space-y-2 border-b border-border/70 pb-5">
					<div class="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-secondary/20 px-3 py-3">
						<div class="flex items-start gap-3">
							<span class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/30">
								<MapPinned class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
							</span>
							<div>
								<p class="text-sm font-medium">Get directions</p>
								<p class="text-xs text-muted-foreground">{eventRecord.addressLine}</p>
							</div>
						</div>
						<Button size="sm" variant="outline" disabled>Coming soon</Button>
					</div>
				</div>
			</div>
		{/if}
	</section>
</main>

{#if eventRecord}
	<div class="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur">
		<div class="mx-auto w-full max-w-[520px] px-4 py-3">
			<Button class="w-full" size="lg" onclick={handleBookTable}>Book a table</Button>
		</div>
	</div>
{/if}

