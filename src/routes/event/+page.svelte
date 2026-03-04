<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Calendar, ChevronRight, Clock3, MapPin, Sparkles, Ticket } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listPublishedEvents, listUserActiveTickets, listUserTicketPurchases } from '$lib/firebase/firestore';
	import type { EventCatalogItem } from '$lib/data/events';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { UserActiveTicketRecord, UserTicketPurchaseRecord } from '$lib/types/models';
	import { animate as motionAnimate, stagger, type DOMKeyframesDefinition, type AnimationOptions } from 'motion';

	function animate(el: Element | Element[] | NodeListOf<Element> | string, kf: DOMKeyframesDefinition, opts?: AnimationOptions) {
		return (motionAnimate as (el: Element | Element[] | NodeListOf<Element> | string, kf: DOMKeyframesDefinition, opts?: AnimationOptions) => void)(el, kf, opts);
	}

	type MainView = 'events' | 'tickets';
	type GenreFilter = 'all' | 'techno' | 'house' | 'dnb' | 'trance';

	const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
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

	const posterOverrides: Record<string, string> = {
		'thursday-den': '/images/events/den.png',
		'red-room': '/images/events/decca.png',
		'void-frequency': '/images/events/monarch.png',
		'saturday-atelier': '/images/events/mission.png'
	};

	let mainView = $state<MainView>('events');
	let genreFilter = $state<GenreFilter>('all');
	let events = $state<EventCatalogItem[]>([]);
	let loadingEvents = $state(true);
	let eventsError = $state('');
	let loadingTickets = $state(false);
	let ticketsError = $state('');
	let tickets = $state<UserActiveTicketRecord[]>([]);
	let ticketPurchases = $state<UserTicketPurchaseRecord[]>([]);

	const sortedEvents = $derived.by(() =>
		[...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
	);
	const filteredEvents = $derived.by(() =>
		sortedEvents.filter((event) => eventMatchesGenre(event, genreFilter))
	);
	const upcomingEvents = $derived.by(() =>
		sortedEvents.filter((event) => parseDate(event.endAt).getTime() >= Date.now())
	);
	const soonEvents = $derived.by(() =>
		(upcomingEvents.length > 0 ? upcomingEvents : sortedEvents).slice(0, 3)
	);
	const featuredEvent = $derived.by(() => filteredEvents[0] ?? sortedEvents[0] ?? null);
	const sortedTickets = $derived.by(() =>
		[...tickets].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
	);
	const sortedPurchases = $derived.by(() =>
		[...ticketPurchases].sort((a, b) => a.eventStartAt.toMillis() - b.eventStartAt.toMillis())
	);

	function parseDate(value: string): Date {
		return new Date(value);
	}

	function eventTimeLine(start: Date, end: Date): string {
		return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function eventDateLine(start: Date, end: Date): string {
		return `${dateLineFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function eventDateShortLine(startAtIso: string): string {
		const start = parseDate(startAtIso);
		return `${shortDateFormatter.format(start).toUpperCase()} - ${timeFormatter.format(start)}`;
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

	function eventPosterImage(event: EventCatalogItem): string {
		return posterOverrides[event.id] ?? event.posterImageUrl ?? '';
	}

	function eventMatchesGenre(event: EventCatalogItem, filter: GenreFilter): boolean {
		if (filter === 'all') {
			return true;
		}

		const haystack = `${event.title} ${event.description} ${event.dressCode} ${event.venue}`.toLowerCase();
		if (filter === 'techno') {
			return /techno|underground|after-hours|void|dark/.test(haystack);
		}
		if (filter === 'house') {
			return /house|disco|atelier|open-format/.test(haystack);
		}
		if (filter === 'dnb') {
			return /dnb|bass|clash|reggae|red room/.test(haystack);
		}
		return /trance|frequency|pulse|reactor/.test(haystack);
	}

	async function handleSignIn(): Promise<void> {
		await openAuthModal({ returnTo: '/event', source: 'event-page' });
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
		const tab = $page.url.searchParams.get('tab');
		mainView = tab === 'tickets' ? 'tickets' : 'events';
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

	$effect(() => {
		if (loadingEvents || filteredEvents.length === 0) return;

		requestAnimationFrame(() => {
			const cards = document.querySelectorAll('[data-event-card]');
			if (cards.length === 0) return;
			animate(
				cards,
				{ opacity: [0, 1], y: [20, 0] },
				{ duration: 0.35, delay: stagger(0.07), ease: [0.22, 1, 0.36, 1] }
			);
		});
	});
</script>

<div class="-mb-16 relative flex min-h-screen flex-col overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div
		class="pointer-events-none fixed inset-0 bg-[radial-gradient(55rem_38rem_at_-10%_-8%,rgb(168_85_247_/_0.22),transparent_55%),radial-gradient(48rem_28rem_at_95%_12%,rgb(34_211_238_/_0.12),transparent_55%),linear-gradient(180deg,#0a0a0f_0%,#0e0512_42%,#050507_100%)]"
	></div>

	<div class="relative z-10">
		<AppHeader />
	</div>

	<main class="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6">
		<section class="flex flex-col gap-3 px-5 pb-1 pt-5 sm:px-8 lg:px-12 lg:pt-8">
			<div class="flex items-center gap-3">
				<div class="inline-flex w-fit items-center gap-2 rounded-full border border-violet-500/35 bg-violet-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-violet-100" style="font-family: 'Space Mono', monospace;">
					<Sparkles class="h-3.5 w-3.5" />
					<span>Live discovery</span>
				</div>
			</div>
			<h1 class="text-[28px] font-extrabold uppercase leading-tight tracking-[-0.03em] sm:text-[36px] lg:text-[44px]" style="font-family: 'Space Grotesk', sans-serif;">Upcoming Events</h1>

			<div class="scrollbar-none flex w-full flex-wrap items-center gap-2 overflow-x-auto">
				<div class="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 p-1" role="tablist" aria-label="Main view">
					<button type="button" class={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${mainView === 'events' ? 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-[0_0_24px_rgba(168,85,247,0.35)]' : 'text-zinc-400 hover:text-white'}`} onclick={() => (mainView = 'events')}>
						<Calendar class="h-4 w-4" />
						<span>Events</span>
					</button>
					<button type="button" class={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${mainView === 'tickets' ? 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-[0_0_24px_rgba(168,85,247,0.35)]' : 'text-zinc-400 hover:text-white'}`} onclick={() => (mainView = 'tickets')}>
						<Ticket class="h-4 w-4" />
						<span>Tickets</span>
					</button>
				</div>
				<a
					href="/host/events"
					class="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 px-4 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white"
					style="font-family: 'Space Grotesk', sans-serif;"
				>
					My events
				</a>
				{#if mainView === 'events'}
					<div class="h-5 w-px shrink-0 bg-zinc-700"></div>
					{#each ['all', 'techno', 'house', 'dnb', 'trance'] as filter}
						<button type="button" class={`h-8 whitespace-nowrap rounded-full border px-3 text-xs font-semibold uppercase tracking-wide transition ${genreFilter === filter ? 'border-lime-300/50 bg-lime-300/10 text-lime-300' : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-cyan-400/45 hover:text-white'}`} onclick={() => (genreFilter = filter as GenreFilter)}>
							{filter === 'all' ? 'All Events' : filter === 'dnb' ? 'DnB' : filter.charAt(0).toUpperCase() + filter.slice(1)}
						</button>
					{/each}
				{/if}
			</div>
		</section>

		{#if mainView === 'events'}
			{#if !loadingEvents && !eventsError && featuredEvent}
				<section class="mx-5 grid overflow-hidden rounded-2xl border border-violet-500/35 bg-zinc-900 sm:mx-8 lg:mx-12 lg:grid-cols-[280px_minmax(0,1fr)]">
					<div class="min-h-[190px]">
						{#if eventPosterImage(featuredEvent)}
							<img class="h-full w-full object-cover" src={eventPosterImage(featuredEvent)} alt={`Featured poster for ${featuredEvent.title}`} loading="lazy" decoding="async" />
						{/if}
					</div>
					<div class="flex flex-col gap-2 bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 p-4 sm:p-6">
						<p class="text-[11px] uppercase tracking-wider text-violet-300" style="font-family: 'Space Mono', monospace;">Featured event</p>
						<h2 class="text-2xl font-bold leading-tight sm:text-3xl" style="font-family: 'Space Grotesk', sans-serif;">{featuredEvent.title}</h2>
						<p class="text-sm leading-6 text-zinc-300">{featuredEvent.description}</p>
						<p class="inline-flex items-center gap-1.5 text-xs text-zinc-300"><Clock3 class="h-3.5 w-3.5" />{eventTimeLine(parseDate(featuredEvent.startAt), parseDate(featuredEvent.endAt))}</p>
						<p class="inline-flex items-center gap-1.5 text-xs text-zinc-300"><MapPin class="h-3.5 w-3.5" />{featuredEvent.venue}</p>
						<p class="text-xs text-zinc-400">{eventDateLine(parseDate(featuredEvent.startAt), parseDate(featuredEvent.endAt))}</p>
						<div class="flex flex-wrap gap-2 pt-1">
							<a href={`/event/${featuredEvent.id}`} class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)] transition duration-200 hover:shadow-[0_0_40px_rgba(168,85,247,0.65)] hover:scale-[1.03]">{featuredEvent.salesMode === 'table-packages' ? 'View Packages' : 'Get Tickets'}</a>
							<a href={`/event/${featuredEvent.id}/request-table`} class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm font-bold text-zinc-200 transition duration-200 hover:border-violet-400/60 hover:text-white hover:shadow-[0_0_24px_rgba(168,85,247,0.35)] hover:scale-[1.03]">Request Table</a>
						</div>
					</div>
				</section>
			{/if}

			<section class="grid gap-4 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12">
				<div class="min-w-0">
					{#if loadingEvents}
						<div class="grid gap-4 sm:grid-cols-2" aria-live="polite" aria-busy="true">
							{#each [1, 2, 3, 4] as placeholder (placeholder)}
								<article class="h-[320px] rounded-2xl border border-zinc-800 skeleton-shimmer"></article>
							{/each}
						</div>
					{:else if eventsError}
						<section class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
							<p>{eventsError}</p>
							<button type="button" class="h-9 w-fit rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white" onclick={loadEvents}>Try again</button>
						</section>
					{:else if filteredEvents.length === 0}
						<section class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
							{#if sortedEvents.length === 0}
								<p>No published events yet.</p>
							{:else}
								<p>No events match this category right now.</p>
								<button type="button" class="h-9 w-fit rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white" onclick={() => (genreFilter = 'all')}>Show all events</button>
							{/if}
						</section>
					{:else}
						<div class="grid gap-4 sm:grid-cols-2">
							{#each filteredEvents as event, index (event.id)}
								<a href={`/event/${event.id}`} data-event-card class="group relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 opacity-0 transition hover:-translate-y-0.5 hover:border-violet-500/60">
									<div class="absolute inset-0">
										{#if eventPosterImage(event)}
											<img class="h-full w-full object-cover" src={eventPosterImage(event)} alt={`Poster for ${event.title}`} loading="lazy" decoding="async" />
										{:else}
											<div class="h-full w-full bg-[radial-gradient(circle_at_15%_15%,rgb(168_85_247_/_0.45),transparent_42%),radial-gradient(circle_at_82%_10%,rgb(34_211_238_/_0.3),transparent_50%),linear-gradient(180deg,#1b1b24_0%,#12121a_60%,#0e0e14_100%)]"></div>
										{/if}
										<div class="absolute inset-0 bg-gradient-to-b from-black/10 via-black/75 to-black/95"></div>
									</div>
									<div class="relative mt-auto flex flex-col gap-3 p-4">
										<h2 class="text-xl font-bold leading-tight text-white sm:text-2xl" style="font-family: 'Space Grotesk', sans-serif;">{event.title}</h2>
										<p class="inline-flex items-center gap-1.5 text-xs text-zinc-300"><Calendar class="h-3.5 w-3.5" />{eventDateShortLine(event.startAt)}</p>
										<div class="flex items-center justify-between gap-3">
											<p class="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-300">
												<MapPin class="h-3.5 w-3.5 shrink-0" />
												<span class="truncate">{event.venue}{event.location ? ` - ${event.location}` : ''}</span>
											</p>
											<span class="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-white">View details <ChevronRight class="h-3.5 w-3.5" /></span>
										</div>
									</div>
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<aside class="flex min-w-0 flex-col gap-2">
					<div class="flex items-center justify-between px-1">
						<p class="text-xs font-bold uppercase tracking-wider text-zinc-300" style="font-family: 'Space Grotesk', sans-serif;">Happening soon</p>
						<span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-400">{soonEvents.length}</span>
					</div>
					{#if loadingEvents}
						{#each [1, 2, 3] as placeholder (placeholder)}
							<div class="h-[74px] rounded-xl border border-zinc-800 skeleton-shimmer"></div>
						{/each}
					{:else if soonEvents.length === 0}
						<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-sm text-zinc-300">No upcoming events.</div>
					{:else}
						{#each soonEvents as event (event.id)}
							<a href={`/event/${event.id}`} class="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2 transition hover:border-violet-500/55">
								<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
									{#if eventPosterImage(event)}
										<img class="h-full w-full object-cover" src={eventPosterImage(event)} alt={`Thumbnail for ${event.title}`} loading="lazy" decoding="async" />
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-[10px] uppercase tracking-wide text-violet-300" style="font-family: 'Space Mono', monospace;">{eventDateShortLine(event.startAt)}</p>
									<p class="truncate text-sm font-bold text-white">{event.title}</p>
									<p class="truncate text-xs text-zinc-400">{event.venue}</p>
								</div>
								<ChevronRight class="ml-auto h-4 w-4 shrink-0 text-zinc-500" />
							</a>
						{/each}
					{/if}
				</aside>
			</section>
		{:else}
			<section class="px-5 sm:px-8 lg:px-12">
				{#if !$currentUser}
					<div class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
						<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Sign in to view your active tables and tickets.</p>
						<p class="text-sm">Once you sign in, your upcoming reservations appear here automatically.</p>
						<button type="button" class="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)]" onclick={handleSignIn}>Sign in</button>
					</div>
				{:else if loadingTickets}
					<div class="grid gap-3 sm:grid-cols-2" aria-live="polite" aria-busy="true">
						{#each [1, 2, 3] as placeholder (placeholder)}
							<article class="h-36 rounded-xl border border-zinc-800 skeleton-shimmer"></article>
						{/each}
					</div>
				{:else if ticketsError}
					<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">{ticketsError}</div>
				{:else if sortedTickets.length === 0 && sortedPurchases.length === 0}
					<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
						<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">No active tickets yet.</p>
						<p class="mt-1 text-sm">Choose an event to reserve a table once event details go live.</p>
					</div>
				{:else}
					<div class="flex flex-col gap-4">
						{#if sortedPurchases.length > 0}
							<section>
								<p class="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-300" style="font-family: 'Space Grotesk', sans-serif;">Ticket purchases</p>
								<div class="grid gap-3 sm:grid-cols-2">
									{#each sortedPurchases as purchase (purchase.purchaseId)}
										<a href={`/event/${purchase.eventId}`} class="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition hover:border-violet-500/55">
											<p class="text-[10px] uppercase tracking-wide text-lime-300" style="font-family: 'Space Mono', monospace;">{purchase.ticketCount} ticket{purchase.ticketCount === 1 ? '' : 's'}</p>
											<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{purchase.eventTitle}</p>
											<p class="text-xs text-zinc-300">{purchaseDateLine(purchase)}</p>
											<p class="text-xs text-zinc-400">{purchase.eventVenue}</p>
											<p class="text-sm text-lime-300" style="font-family: 'Space Mono', monospace;">{formatPurchasePrice(purchase.subtotalCents)}</p>
										</a>
									{/each}
								</div>
							</section>
						{/if}

						{#if sortedTickets.length > 0}
							<section>
								<p class="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-300" style="font-family: 'Space Grotesk', sans-serif;">Active tables</p>
								<div class="grid gap-3 sm:grid-cols-2">
									{#each sortedTickets as ticket (ticket.reservationId)}
										<a href={`/r/${ticket.reservationId}`} class="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition hover:border-violet-500/55">
											<p class="text-[10px] uppercase tracking-wide text-zinc-300" style="font-family: 'Space Mono', monospace;">Active ticket</p>
											<p class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{ticket.clubName}</p>
											<p class="text-xs text-zinc-300">{ticketDateLine(ticket)}</p>
											<p class="text-xs text-zinc-400">Table: {ticket.tableType}</p>
											<p class="text-xs text-zinc-400">Guest: {ticket.guestDisplayName}{ticket.plusOneCount > 0 ? ` (+${ticket.plusOneCount})` : ''}</p>
										</a>
									{/each}
								</div>
							</section>
						{/if}
					</div>
				{/if}
			</section>
		{/if}

	</main>

	<footer class="relative z-10 mt-2 w-full border-t border-zinc-800 bg-[#0e0e12]">
		<div class="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-8 text-zinc-300 sm:px-8 lg:px-12">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-lg font-extrabold uppercase text-white" style="font-family: 'Space Grotesk', sans-serif;">Nightclub Guestlist</p>
					<p class="text-sm text-zinc-400">Your gateway to underground nights and hosted experiences.</p>
				</div>
			</div>
			<div class="flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
				<p class="text-sm text-zinc-300">Stay in the loop when newly published events drop.</p>
				<a href="/event" class="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-3 text-xs font-bold text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]">Browse Events</a>
			</div>
			<div class="flex flex-col gap-2 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
				<span>(c) 2026 Nightclub Guestlist. All rights reserved.</span>
			</div>
		</div>
	</footer>
</div>


