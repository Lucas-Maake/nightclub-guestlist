<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { currentUser, signOutCurrentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listPublishedEvents, listUserActiveTickets, listUserTicketPurchases } from '$lib/firebase/firestore';
	import type { EventCatalogItem } from '$lib/data/events';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { UserActiveTicketRecord, UserTicketPurchaseRecord } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';

	type EventTab = 'events' | 'tickets';
	type EventCardState = 'tonight' | 'upcoming' | 'past';
	type EventCardBadgeVariant = 'default' | 'success' | 'live' | 'outline' | 'destructive';

	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
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

	let activeTab = $state<EventTab>('events');
	let events = $state<EventCatalogItem[]>([]);
	let loadingEvents = $state(true);
	let eventsError = $state('');
	let loadingTickets = $state(false);
	let ticketsError = $state('');
	let tickets = $state<UserActiveTicketRecord[]>([]);
	let ticketPurchases = $state<UserTicketPurchaseRecord[]>([]);

	const sortedEvents = $derived(
		[...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
	);
	const sortedTickets = $derived.by(() =>
		[...tickets].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
	);
	const sortedPurchases = $derived.by(() =>
		[...ticketPurchases].sort((a, b) => a.eventStartAt.toMillis() - b.eventStartAt.toMillis())
	);

	function parseDate(value: string): Date {
		return new Date(value);
	}

	function dateBadgeDay(date: Date): string {
		return String(date.getDate()).padStart(2, '0');
	}

	function dateBadgeMonth(date: Date): string {
		return monthFormatter.format(date);
	}

	function eventDateLine(start: Date, end: Date): string {
		return `${dateLineFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function ticketDateLine(ticket: UserActiveTicketRecord): string {
		const start = ticket.startAt.toDate();
		return `${dateLineFormatter.format(start)} at ${timeFormatter.format(start)}`;
	}

	function purchaseDateLine(purchase: UserTicketPurchaseRecord): string {
		const start = purchase.eventStartAt.toDate();
		return `${dateLineFormatter.format(start)} at ${timeFormatter.format(start)}`;
	}

	function formatPurchasePrice(cents: number): string {
		return currencyFormatter.format(cents / 100);
	}

	function eventCardState(event: EventCatalogItem): EventCardState {
		const start = parseDate(event.startAt);
		const end = parseDate(event.endAt);
		const now = new Date();
		if (end.getTime() < now.getTime()) {
			return 'past';
		}

		if (start.toDateString() === now.toDateString()) {
			return 'tonight';
		}

		return 'upcoming';
	}

	function eventCardStateLabel(state: EventCardState): string {
		if (state === 'tonight') {
			return 'Tonight';
		}

		if (state === 'past') {
			return 'Past';
		}

		return 'Upcoming';
	}

	function eventCardStateVariant(state: EventCardState): EventCardBadgeVariant {
		if (state === 'tonight') {
			return 'live';
		}

		if (state === 'past') {
			return 'outline';
		}

		return 'default';
	}

	function eventTableAvailability(
		event: EventCatalogItem
	): { label: string; variant: EventCardBadgeVariant } {
		const start = parseDate(event.startAt);
		const end = parseDate(event.endAt);
		const nowMs = Date.now();
		if (end.getTime() < nowMs) {
			return { label: 'Booking closed', variant: 'outline' };
		}

		const hoursUntilStart = (start.getTime() - nowMs) / (1000 * 60 * 60);
		if (hoursUntilStart <= 24) {
			return { label: 'Limited tables', variant: 'default' };
		}

		return { label: 'Tables available', variant: 'success' };
	}

	function eventStartingPriceLabel(event: EventCatalogItem): string {
		const prices = event.ticketTiers
			.map((tier) => tier.priceCents)
			.filter((priceCents) => Number.isFinite(priceCents) && priceCents > 0);
		if (prices.length === 0) {
			return 'Pricing soon';
		}

		const lowest = Math.min(...prices);
		return `From ${currencyFormatter.format(lowest / 100)}`;
	}

	async function handleSignIn(): Promise<void> {
		await openAuthModal({ returnTo: '/event', source: 'event-page' });
	}

	async function handleSignOut(): Promise<void> {
		await signOutCurrentUser();
		await goto('/');
	}

	async function handleMyEvents(): Promise<void> {
		await goto('/host/events');
	}

	function openEventsTab(): void {
		activeTab = 'events';
	}

	async function handleCreateEvent(): Promise<void> {
		await goto('/create');
	}

	async function loadTicketsFor(uid: string): Promise<void> {
		loadingTickets = true;
		ticketsError = '';
		try {
			const [rsvpResult, purchasesResult] = await Promise.allSettled([
				listUserActiveTickets(uid),
				listUserTicketPurchases(uid)
			]);
			tickets = rsvpResult.status === 'fulfilled' ? rsvpResult.value : [];
			ticketPurchases = purchasesResult.status === 'fulfilled' ? purchasesResult.value : [];

			if (rsvpResult.status === 'rejected' && purchasesResult.status === 'rejected') {
				ticketsError = 'Unable to load tickets right now.';
			}
		} catch {
			tickets = [];
			ticketPurchases = [];
			ticketsError = 'Unable to load tickets right now.';
		} finally {
			loadingTickets = false;
		}
	}

	async function loadEvents(): Promise<void> {
		loadingEvents = true;
		eventsError = '';
		try {
			events = await listPublishedEvents();
		} catch {
			events = [];
			eventsError = 'Unable to load events right now.';
		} finally {
			loadingEvents = false;
		}
	}

	onMount(async () => {
		await waitForAuthReady();
		await loadEvents();
	});

	$effect(() => {
		const uid = $currentUser?.uid ?? '';
		if (!uid) {
			tickets = [];
			ticketPurchases = [];
			loadingTickets = false;
			ticketsError = '';
			return;
		}

		void loadTicketsFor(uid);
	});
</script>

<main class="app-shell py-8 sm:py-10">
	<section class="mx-auto w-full max-w-[520px] space-y-5">
		<div class="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
			<a class="inline-flex items-center gap-2 text-foreground no-underline" href="/">
				<BrandMark class="h-4 w-4" />
				<span class="text-sm font-semibold">Events</span>
			</a>
			{#if $currentUser}
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="sm" onclick={handleMyEvents}>My events</Button>
					<Button variant="outline" size="sm" onclick={handleSignOut}>Sign out</Button>
				</div>
			{:else}
				<Button variant="outline" size="sm" onclick={handleSignIn}>Sign in</Button>
			{/if}
		</div>

		<Tabs>
			<TabsList class="grid h-auto w-full grid-cols-2 rounded-none border-b border-border/70 bg-transparent p-0">
				<TabsTrigger
					active={activeTab === 'events'}
					onclick={() => (activeTab = 'events')}
					class={cn(
						'h-10 w-full justify-center rounded-none border-b-2 px-0 pb-2 pt-0 text-xs uppercase tracking-[0.18em] !shadow-none',
						activeTab === 'events'
							? '!border-foreground !bg-transparent !text-foreground'
							: '!border-transparent !bg-transparent !text-muted-foreground'
					)}
				>
					Events
				</TabsTrigger>
				<TabsTrigger
					active={activeTab === 'tickets'}
					onclick={() => (activeTab = 'tickets')}
					class={cn(
						'h-10 w-full justify-center rounded-none border-b-2 px-0 pb-2 pt-0 text-xs uppercase tracking-[0.18em] !shadow-none',
						activeTab === 'tickets'
							? '!border-foreground !bg-transparent !text-foreground'
							: '!border-transparent !bg-transparent !text-muted-foreground'
					)}
				>
					Tickets
				</TabsTrigger>
			</TabsList>

			{#if activeTab === 'events'}
				<TabsContent class="space-y-4 pt-1">
					{#if loadingEvents}
						<div class="space-y-4" aria-live="polite" aria-busy="true">
							{#each [1, 2, 3] as _}
								<div class="overflow-hidden rounded-2xl border border-border/70 bg-card/35">
									<div class="relative min-h-[360px] animate-pulse bg-secondary/40 p-4 sm:min-h-[390px]">
										<div class="absolute left-4 top-4 flex gap-2">
											<div class="h-5 w-16 rounded-full bg-secondary/60"></div>
											<div class="h-5 w-20 rounded-full bg-secondary/60"></div>
										</div>
										<div class="absolute right-4 top-4">
											<div class="h-14 w-12 rounded-lg bg-white/20"></div>
										</div>
										<div class="absolute inset-x-4 bottom-4 space-y-2">
											<div class="h-6 w-3/4 rounded bg-secondary/60"></div>
											<div class="h-4 w-1/2 rounded bg-secondary/50"></div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else if eventsError}
						<div class="state-panel-muted">
							<p>{eventsError}</p>
							<Button class="mt-3" size="sm" variant="outline" onclick={loadEvents}>Try again</Button>
						</div>
					{:else if sortedEvents.length === 0}
						<div class="state-panel-muted">
							<p>No published events yet.</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<Button size="sm" variant="outline" onclick={loadEvents}>Refresh</Button>
								<a class={cn(buttonVariants({ size: 'sm' }))} href="/create">Create event</a>
							</div>
						</div>
					{:else}
						{#each sortedEvents as event (event.id)}
							<a
								href={`/event/${event.id}`}
								class="group block overflow-hidden rounded-2xl border border-border/70 bg-card/40 no-underline backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_30px_hsl(212_95%_58%/0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
								aria-label={`Open ${event.title}`}
							>
								<div class={cn('relative min-h-[360px] p-4 sm:min-h-[390px]', event.posterImageUrl ? '' : event.posterClass)}>
									{#if event.posterImageUrl}
										<img
											src={event.posterImageUrl}
											alt={`Poster for ${event.title}`}
											class="absolute inset-0 h-full w-full object-cover"
											loading="lazy"
											decoding="async"
										/>
									{/if}
									<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/12 to-black/75"></div>
									<div class="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
										<Badge variant={eventCardStateVariant(eventCardState(event))}>
											{eventCardStateLabel(eventCardState(event))}
										</Badge>
										<Badge variant={eventTableAvailability(event).variant}>
											{eventTableAvailability(event).label}
										</Badge>
									</div>
									<div class="absolute right-4 top-4 z-10">
										<div class="rounded-lg bg-white px-2 py-1 text-center">
											<p class="text-xl font-bold leading-none text-[#0f172a]">{dateBadgeDay(parseDate(event.startAt))}</p>
											<p class="text-[10px] font-semibold uppercase tracking-wide text-[#475569]">
												{dateBadgeMonth(parseDate(event.startAt))}
											</p>
										</div>
									</div>
									<div class="absolute bottom-4 left-4 right-4 z-10 space-y-2 text-left">
										<p class="text-[0.72rem] uppercase tracking-[0.2em] text-white/75">{event.venue}</p>
										<p class="text-4xl font-black uppercase leading-[0.9] tracking-tight text-white/88">
											{event.posterHeadline}
										</p>
										<p class="text-xl font-semibold leading-tight text-white">{event.title}</p>
										<p class="text-xs font-semibold text-primary">{eventStartingPriceLabel(event)}</p>
										<p class="text-xs text-white/78">
											{eventDateLine(parseDate(event.startAt), parseDate(event.endAt))}
										</p>
										<p class="text-xs uppercase tracking-[0.16em] text-white/65">{event.location}</p>
									</div>
								</div>
							</a>
						{/each}
					{/if}
				</TabsContent>
			{:else}
				<TabsContent class="space-y-4 pt-1">
					{#if !$currentUser}
						<div class="state-panel-muted">
							<p class="font-medium text-foreground">Sign in to view your active tables and tickets.</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Once you sign in, your upcoming reservations appear here automatically.
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<Button size="sm" onclick={handleSignIn}>Sign in</Button>
								<Button size="sm" variant="outline" onclick={openEventsTab}>Browse events</Button>
							</div>
						</div>
					{:else if loadingTickets}
						<div class="space-y-3" aria-live="polite" aria-busy="true">
							{#each [1, 2] as _}
								<div class="animate-pulse rounded-2xl border border-border/70 bg-card/40 p-4">
									<div class="h-3 w-20 rounded bg-secondary/50"></div>
									<div class="mt-3 h-5 w-2/3 rounded bg-secondary/60"></div>
									<div class="mt-2 h-4 w-1/2 rounded bg-secondary/50"></div>
									<div class="mt-3 flex gap-2">
										<div class="h-5 w-16 rounded-full bg-secondary/50"></div>
										<div class="h-5 w-20 rounded-full bg-secondary/50"></div>
									</div>
								</div>
							{/each}
						</div>
					{:else if ticketsError}
						<p class="state-panel-error" aria-live="polite">{ticketsError}</p>
					{:else if sortedTickets.length === 0 && sortedPurchases.length === 0}
						<div class="state-panel-muted">
							<p>No active tickets yet.</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Choose an event to reserve a table once event details go live.
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<Button size="sm" onclick={openEventsTab}>Browse events</Button>
								<Button size="sm" variant="outline" onclick={handleCreateEvent}>Host an event</Button>
							</div>
						</div>
					{:else}
						<div class="space-y-5">
							{#if sortedPurchases.length > 0}
								<div class="space-y-3">
									<p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Purchased Tickets</p>
									{#each sortedPurchases as purchase (purchase.purchaseId)}
										<a
											href={`/event/${purchase.eventId}`}
											class="block rounded-2xl border border-border/70 bg-card/40 p-4 no-underline backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_25px_hsl(212_95%_58%/0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
											aria-label={`View ${purchase.eventTitle} tickets`}
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 flex-1">
													<p class="text-xs uppercase tracking-[0.18em] text-primary">
														{purchase.ticketCount} ticket{purchase.ticketCount === 1 ? '' : 's'}
													</p>
													<p class="mt-2 truncate text-lg font-semibold">{purchase.eventTitle}</p>
													<p class="mt-1 text-sm text-muted-foreground">{purchase.eventVenue}</p>
													<p class="mt-1 text-sm text-muted-foreground">{purchaseDateLine(purchase)}</p>
												</div>
												<div class="text-right">
													<p class="text-sm font-semibold">{formatPurchasePrice(purchase.subtotalCents)}</p>
												</div>
											</div>
											<div class="mt-3 flex flex-wrap gap-1.5">
												{#each purchase.items as item}
													<Badge variant="outline" class="text-xs">
														{item.tierLabel} &times; {item.quantity}
													</Badge>
												{/each}
											</div>
										</a>
									{/each}
								</div>
							{/if}
							{#if sortedTickets.length > 0}
								<div class="space-y-3">
									{#if sortedPurchases.length > 0}
										<p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Table Reservations</p>
									{/if}
									{#each sortedTickets as ticket (ticket.reservationId)}
										<a
											href={`/r/${ticket.reservationId}`}
											class="block rounded-2xl border border-border/70 bg-card/40 p-4 no-underline backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_25px_hsl(212_95%_58%/0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
											aria-label={`Open RSVP for ${ticket.clubName}`}
										>
											<p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active ticket</p>
											<p class="mt-2 text-lg font-semibold">{ticket.clubName}</p>
											<p class="mt-1 text-sm text-muted-foreground">{ticketDateLine(ticket)}</p>
											<p class="mt-1 text-sm text-muted-foreground">Table: {ticket.tableType}</p>
											<p class="mt-1 text-sm text-muted-foreground">
												Guest: {ticket.guestDisplayName} {ticket.plusOneCount > 0 ? `(+${ticket.plusOneCount})` : ''}
											</p>
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</TabsContent>
			{/if}
		</Tabs>
	</section>
</main>
