<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Bell, Calendar, Clock3, MapPin, Search, Ticket, User } from 'lucide-svelte';
	import { currentUser, signOutCurrentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listPublishedEvents, listUserActiveTickets, listUserTicketPurchases } from '$lib/firebase/firestore';
	import type { EventCatalogItem } from '$lib/data/events';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { UserActiveTicketRecord, UserTicketPurchaseRecord } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';

	type MainView = 'events' | 'tickets';
	type GenreFilter = 'all' | 'techno' | 'house' | 'dnb' | 'trance';
	type EventCardState = 'tonight' | 'upcoming' | 'past';

	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
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

	const eqHeights = [14, 22, 11, 28, 18, 32, 15, 25, 20, 34, 13, 24, 29, 17, 26, 19];
	const eqDurations = [0.82, 1.05, 0.74, 1.22, 0.93, 1.14, 0.8, 1.18, 0.88, 1.28, 0.78, 1.06, 1.16, 0.86, 1.24, 0.92];

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
	const featuredEvents = $derived.by(() =>
		sortedEvents.filter((event) => eventMatchesGenre(event, genreFilter)).slice(0, 4)
	);
	const featuredBanner = $derived.by(() => featuredEvents[0] ?? sortedEvents[0] ?? null);
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

	function eventTimeLine(start: Date, end: Date): string {
		return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
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

	function eventStateLabel(state: EventCardState, startAtIso: string): string {
		if (state === 'tonight') {
			return 'Tonight';
		}
		if (state === 'past') {
			return 'Past';
		}
		return shortDateFormatter.format(parseDate(startAtIso)).toUpperCase();
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

	function tabClass(active: boolean): string {
		return cn('tab-chip', active && 'tab-chip--active');
	}

	async function handleSignIn(): Promise<void> {
		await openAuthModal({ returnTo: '/event', source: 'event-page' });
	}

	async function handleSignOut(): Promise<void> {
		await signOutCurrentUser();
	}

	async function handleMyEvents(): Promise<void> {
		await goto('/host/events');
	}

	async function handleProfileAction(): Promise<void> {
		if (!$currentUser) {
			await handleSignIn();
			return;
		}

		await handleMyEvents();
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

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="events-page">
	<div class="ambient-glow" aria-hidden="true">
		<div class="orb orb--1"></div>
		<div class="orb orb--2"></div>
		<div class="orb orb--3"></div>
	</div>
	<div class="grain" aria-hidden="true"></div>
	<div class="scanline" aria-hidden="true"></div>

	<main class="page-wrapper">
		<header class="header">
			<div class="header-left">
				<p class="header-label">Tonight &amp; Upcoming</p>
				<h1 class="header-title">Events</h1>
			</div>
			<div class="header-actions">
				{#if $currentUser}
					<button type="button" class="utility-btn" onclick={handleMyEvents}>My events</button>
					<button type="button" class="utility-btn" onclick={handleSignOut}>Sign out</button>
				{/if}
				<button type="button" class="bell-btn" aria-label="Notifications">
					<Bell class="h-5 w-5" />
				</button>
			</div>
		</header>

		<div class="filter-tabs" role="tablist" aria-label="Event genres">
			<button type="button" class={tabClass(genreFilter === 'all')} onclick={() => (genreFilter = 'all')}>All Events</button>
			<button type="button" class={tabClass(genreFilter === 'techno')} onclick={() => (genreFilter = 'techno')}>Techno</button>
			<button type="button" class={tabClass(genreFilter === 'house')} onclick={() => (genreFilter = 'house')}>House</button>
			<button type="button" class={tabClass(genreFilter === 'dnb')} onclick={() => (genreFilter = 'dnb')}>DnB</button>
			<button type="button" class={tabClass(genreFilter === 'trance')} onclick={() => (genreFilter = 'trance')}>Trance</button>
		</div>

		{#if mainView === 'events'}
			{#if loadingEvents}
				<section class="events-row" aria-live="polite" aria-busy="true">
					{#each [1, 2, 3, 4] as placeholder, index (placeholder)}
						<div class="event-card skeleton" style={`animation-delay:${500 + index * 100}ms`}></div>
					{/each}
				</section>
			{:else if eventsError}
				<section class="state-panel">
					<p>{eventsError}</p>
					<button type="button" class="cta-button cta-button--ghost" onclick={loadEvents}>Try again</button>
				</section>
			{:else if featuredEvents.length === 0}
				<section class="state-panel">
					<p>No events match this category right now.</p>
					<button type="button" class="cta-button cta-button--ghost" onclick={() => (genreFilter = 'all')}>Show all events</button>
				</section>
			{:else}
				<section class="events-row">
					{#each featuredEvents as event, index (event.id)}
						<a href={`/event/${event.id}`} class="event-card" style={`animation-delay:${500 + index * 100}ms`}>
							{#if eventPosterImage(event)}
								<img
									class="card-img"
									src={eventPosterImage(event)}
									alt={`Poster for ${event.title}`}
									loading="lazy"
									decoding="async"
								/>
							{/if}
							<div class="card-overlay"></div>
							<div class="card-content">
								<p class="card-title">{event.title}</p>
								<span class="card-date-badge">{eventStateLabel(eventCardState(event), event.startAt)}</span>
								<div class="card-meta">
									<span class="card-meta-item"><Clock3 class="h-3.5 w-3.5" />{eventTimeLine(parseDate(event.startAt), parseDate(event.endAt))}</span>
									<span class="card-meta-item"><MapPin class="h-3.5 w-3.5" />{event.venue}</span>
								</div>
							</div>
						</a>
					{/each}
				</section>

				{#if featuredBanner}
					<section class="rave-banner motion-block" style="animation-delay: 1000ms">
						<img class="rave-banner-img" src={eventPosterImage(featuredBanner)} alt={`Banner for ${featuredBanner.title}`} />
						<div class="rave-banner-overlay"></div>

						<div class="eq-visualizer" aria-hidden="true">
							{#each eqHeights as height, index (index)}
								<span
									class="eq-bar"
									style={`--eq-h:${height}px; --eq-dur:${eqDurations[index]}s; animation-delay:${(index % 6) * 120}ms`}
								></span>
							{/each}
						</div>

						<div class="rave-banner-content">
							<div class="rave-banner-text">
								<h2>Feel The Bass</h2>
								<p>// {featuredEvents.length} events loaded - don&apos;t miss out</p>
							</div>
						</div>
					</section>
				{/if}
			{/if}
		{:else}
			<section class="tickets-panel motion-block" style="animation-delay: 450ms">
				{#if !$currentUser}
					<div class="state-panel">
						<p class="state-title">Sign in to view your active tables and tickets.</p>
						<p class="state-subtitle">Once you sign in, your upcoming reservations appear here automatically.</p>
						<button type="button" class="cta-button" onclick={handleSignIn}>Sign in</button>
					</div>
				{:else if loadingTickets}
					<div class="tickets-list" aria-live="polite" aria-busy="true">
						{#each [1, 2, 3] as placeholder (placeholder)}
							<div class="ticket-card skeleton"></div>
						{/each}
					</div>
				{:else if ticketsError}
					<div class="state-panel">{ticketsError}</div>
				{:else if sortedTickets.length === 0 && sortedPurchases.length === 0}
					<div class="state-panel">
						<p class="state-title">No active tickets yet.</p>
						<p class="state-subtitle">Choose an event to reserve a table once event details go live.</p>
					</div>
				{:else}
					<div class="tickets-list">
						{#each sortedPurchases as purchase (purchase.purchaseId)}
							<a href={`/event/${purchase.eventId}`} class="ticket-card">
								<p class="ticket-chip">{purchase.ticketCount} ticket{purchase.ticketCount === 1 ? '' : 's'}</p>
								<p class="ticket-title">{purchase.eventTitle}</p>
								<p class="ticket-meta">{purchaseDateLine(purchase)}</p>
								<p class="ticket-price">{formatPurchasePrice(purchase.subtotalCents)}</p>
							</a>
						{/each}

						{#each sortedTickets as ticket (ticket.reservationId)}
							<a href={`/r/${ticket.reservationId}`} class="ticket-card">
								<p class="ticket-chip ticket-chip--muted">Active ticket</p>
								<p class="ticket-title">{ticket.clubName}</p>
								<p class="ticket-meta">{ticketDateLine(ticket)}</p>
								<p class="ticket-meta">Table: {ticket.tableType}</p>
								<p class="ticket-meta">Guest: {ticket.guestDisplayName} {ticket.plusOneCount > 0 ? `(+${ticket.plusOneCount})` : ''}</p>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<nav class="bottom-nav">
			<button type="button" class={cn('nav-item', mainView === 'events' ? 'nav-item--active' : 'nav-item--inactive')} onclick={() => (mainView = 'events')}>
				<Calendar class="h-[22px] w-[22px]" />
				<span>Events</span>
			</button>
			<button type="button" class="nav-item nav-item--inactive" onclick={() => goto('/')}>
				<Search class="h-[22px] w-[22px]" />
				<span>Explore</span>
			</button>
			<button type="button" class={cn('nav-item', mainView === 'tickets' ? 'nav-item--active' : 'nav-item--inactive')} onclick={() => (mainView = 'tickets')}>
				<Ticket class="h-[22px] w-[22px]" />
				<span>Tickets</span>
			</button>
			<button type="button" class="nav-item nav-item--inactive" onclick={handleProfileAction}>
				<User class="h-[22px] w-[22px]" />
				<span>{$currentUser ? 'Profile' : 'Sign in'}</span>
			</button>
		</nav>
	</main>
</div>

<style>
	.events-page {
		--void: #0a0a0f;
		--surface: #15152080;
		--border: #1e1e3a;
		--border-light: #2a2a3a;
		--text-primary: #ffffff;
		--text-secondary: #8a8aaa;
		--text-muted: #525260;
		--accent-start: #4f5aff;
		--accent-end: #7b3fe4;
		position: relative;
		min-height: 100vh;
		background: var(--void);
		color: var(--text-primary);
		font-family: 'DM Sans', sans-serif;
		overflow: hidden;
	}

	.page-wrapper {
		position: relative;
		z-index: 2;
		max-width: 1440px;
		margin: 0 auto;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		padding-bottom: 96px;
	}

	.ambient-glow,
	.grain,
	.scanline {
		position: fixed;
		inset: 0;
		pointer-events: none;
	}

	.ambient-glow {
		z-index: 0;
		overflow: hidden;
	}

	.orb {
		position: absolute;
		border-radius: 999px;
		filter: blur(120px);
		opacity: 0.14;
		animation: orb-float 12s ease-in-out infinite alternate;
	}

	.orb--1 {
		width: 620px;
		height: 620px;
		top: -220px;
		left: -120px;
		background: #7b3fe4;
	}

	.orb--2 {
		width: 520px;
		height: 520px;
		top: 36%;
		right: -170px;
		background: #4f5aff;
		animation-delay: -4s;
		animation-duration: 15s;
	}

	.orb--3 {
		width: 420px;
		height: 420px;
		left: 32%;
		bottom: -120px;
		background: #7b3fe4;
		animation-delay: -7s;
		animation-duration: 18s;
	}

	.grain {
		z-index: 1;
		opacity: 0.035;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 200px;
	}

	.scanline {
		z-index: 1;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			rgba(0, 0, 0, 0.03) 2px,
			rgba(0, 0, 0, 0.03) 4px
		);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 28px 40px 20px;
		opacity: 0;
		transform: translateY(20px);
		animation: fade-slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.header-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 4px;
		text-transform: uppercase;
		color: rgba(79, 90, 255, 0.64);
	}

	.header-title {
		font-family: 'Sora', sans-serif;
		font-size: 42px;
		font-weight: 800;
		letter-spacing: -2px;
		line-height: 1;
		margin: 0;
		background: linear-gradient(135deg, #ffffff 58%, #4f5aff);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.utility-btn {
		height: 34px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid var(--border-light);
		background: var(--surface);
		color: #b8bbd8;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 180ms ease;
	}

	.utility-btn:hover {
		border-color: #4f5aff80;
		color: #fff;
	}

	.bell-btn {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		border: 1px solid var(--border-light);
		background: var(--surface);
		color: #8a8aaa;
		cursor: pointer;
		position: relative;
		transition: all 240ms ease;
	}

	.bell-btn::after {
		content: '';
		position: absolute;
		top: 11px;
		right: 12px;
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: #e040a0;
		box-shadow: 0 0 8px #e040a0;
		animation: notif-pulse 2s ease-in-out infinite;
	}

	.bell-btn:hover {
		color: #fff;
		border-color: #4f5aff;
		box-shadow: 0 0 20px rgba(79, 90, 255, 0.25);
		transform: scale(1.05);
	}

	.filter-tabs {
		display: flex;
		gap: 10px;
		padding: 0 40px 24px;
		overflow-x: auto;
		scrollbar-width: none;
		opacity: 0;
		transform: translateY(20px);
		animation: fade-slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.35s forwards;
	}

	.filter-tabs::-webkit-scrollbar {
		display: none;
	}

	.tab-chip {
		height: 38px;
		padding: 0 22px;
		border-radius: 999px;
		border: 1px solid var(--border-light);
		background: var(--surface);
		color: var(--text-muted);
		font-family: 'DM Sans', sans-serif;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		transition: all 280ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.tab-chip:hover {
		color: #9b9ebb;
		border-color: #3a3a4f;
	}

	.tab-chip--active {
		border-color: transparent;
		background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
		color: #fff;
		font-weight: 700;
		box-shadow: 0 0 24px rgba(79, 90, 255, 0.35), 0 0 60px rgba(123, 63, 228, 0.18);
	}

	.events-row {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 18px;
		padding: 0 40px 32px;
	}

	.event-card {
		position: relative;
		overflow: hidden;
		height: 240px;
		border-radius: 18px;
		border: 1px solid var(--border);
		text-decoration: none;
		color: #ffffff;
		opacity: 0;
		transform: translateY(26px);
		animation: fade-slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
		transition: transform 360ms cubic-bezier(0.16, 1, 0.3, 1), border-color 260ms ease, box-shadow 260ms ease;
	}

	.event-card.skeleton {
		background: #131623;
	}

	.event-card:hover {
		transform: translateY(-6px) scale(1.02);
		border-color: #4f5aff;
		box-shadow: 0 12px 50px rgba(79, 90, 255, 0.25), 0 0 0 1px rgba(79, 90, 255, 0.12);
	}

	.event-card:hover .card-img {
		transform: scale(1.1);
	}

	.card-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: brightness(0.7) saturate(0.88);
		transition: transform 6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.card-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, #0a0a0f 0%, rgba(10, 10, 15, 0.86) 40%, rgba(10, 10, 15, 0) 100%);
	}

	.card-content {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px 22px;
	}

	.card-date-badge {
		display: inline-flex;
		align-self: flex-start;
		padding: 4px 12px;
		border-radius: 999px;
		background: rgba(79, 90, 255, 0.32);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 2px;
		text-transform: uppercase;
		backdrop-filter: blur(8px);
	}

	.card-title {
		margin: 0;
		font-family: 'Sora', sans-serif;
		font-size: 25px;
		font-weight: 800;
		letter-spacing: -0.7px;
		line-height: 1.1;
		text-transform: uppercase;
		color: #ffffff;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		font-size: 12px;
		color: #ffffff;
	}

	.card-meta-item {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		opacity: 0.92;
	}

	.rave-banner {
		position: relative;
		height: 500px;
		margin: 0 40px;
		border-radius: 24px;
		overflow: hidden;
	}

	.rave-banner-img {
		position: absolute;
		inset: -40px;
		width: calc(100% + 80px);
		height: calc(100% + 80px);
		object-fit: cover;
		object-position: center 40%;
		animation: banner-zoom 25s ease-in-out infinite alternate;
	}

	.rave-banner-overlay {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(to top, #0a0a0f 0%, transparent 40%),
			linear-gradient(to bottom, #0a0a0f 0%, transparent 30%),
			radial-gradient(ellipse at 50% 80%, rgba(79, 90, 255, 0.16) 0%, transparent 60%);
	}

	.rave-banner-content {
		position: absolute;
		left: 48px;
		right: 48px;
		bottom: 48px;
		display: flex;
		align-items: flex-end;
		gap: 16px;
	}

	.rave-banner-text h2 {
		margin: 0;
		font-family: 'Sora', sans-serif;
		font-size: 56px;
		font-weight: 800;
		letter-spacing: -2px;
		line-height: 1;
		text-transform: uppercase;
		background: linear-gradient(135deg, #fff 30%, #7dd3fc 100%);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.rave-banner-text p {
		margin: 10px 0 0;
		font-size: 14px;
		letter-spacing: 1px;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.eq-visualizer {
		position: absolute;
		top: 48px;
		right: 48px;
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 40px;
		opacity: 0.58;
	}

	.eq-bar {
		width: 4px;
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(to top, #4f5aff, #7b3fe4);
		animation: eq-bounce var(--eq-dur) ease-in-out infinite alternate;
	}

	.cta-button {
		height: 48px;
		padding: 0 32px;
		border-radius: 999px;
		border: none;
		background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
		color: #fff;
		font-family: 'Sora', sans-serif;
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 2px;
		text-transform: uppercase;
		cursor: pointer;
		box-shadow: 0 0 30px rgba(79, 90, 255, 0.3);
		transition: all 280ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.cta-button:hover {
		transform: translateY(-2px) scale(1.02);
		box-shadow: 0 0 50px rgba(79, 90, 255, 0.5), 0 8px 30px rgba(0, 0, 0, 0.4);
	}

	.cta-button--ghost {
		height: 40px;
		padding: 0 18px;
		font-size: 12px;
		letter-spacing: 1px;
	}

	.motion-block {
		opacity: 0;
		transform: translateY(24px);
		animation: fade-slide-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.tickets-panel {
		margin: 0 40px 20px;
	}

	.tickets-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	.ticket-card {
		display: block;
		padding: 18px;
		border-radius: 16px;
		border: 1px solid var(--border);
		background: rgba(17, 18, 25, 0.84);
		text-decoration: none;
		transition: border-color 220ms ease, transform 220ms ease;
	}

	.ticket-card:hover {
		border-color: #4f5aff80;
		transform: translateY(-2px);
	}

	.ticket-card.skeleton {
		height: 120px;
		background: #141623;
	}

	.ticket-chip {
		margin: 0;
		color: #6b7aff;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.ticket-chip--muted {
		color: var(--text-secondary);
	}

	.ticket-title {
		margin: 10px 0 0;
		font-family: 'Sora', sans-serif;
		font-size: 18px;
		font-weight: 700;
		color: #fff;
	}

	.ticket-meta {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--text-secondary);
	}

	.ticket-price {
		margin: 10px 0 0;
		font-size: 16px;
		font-weight: 700;
		color: #fff;
	}

	.state-panel {
		margin: 0 40px 16px;
		padding: 16px;
		border-radius: 14px;
		border: 1px solid var(--border);
		background: rgba(17, 18, 25, 0.84);
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.state-title {
		margin: 0;
		color: #fff;
		font-size: 16px;
		font-weight: 700;
	}

	.state-subtitle {
		margin: 0;
		font-size: 13px;
	}

	.bottom-nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		z-index: 20;
		display: flex;
		justify-content: space-around;
		align-items: center;
		gap: 8px;
		padding: 16px 0 24px;
		border-top: 1px solid var(--border);
		background: #0a0a0fe6;
		backdrop-filter: blur(6px);
		opacity: 0;
		transform: translateY(20px);
		animation: fade-slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.2s forwards;
	}

	.nav-item {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 11px;
		font-weight: 500;
		transition: color 220ms ease;
	}

	.nav-item--inactive {
		color: var(--text-muted);
	}

	.nav-item--inactive:hover {
		color: var(--text-secondary);
	}

	.nav-item--active {
		color: #4f5aff;
		font-weight: 700;
	}

	.nav-item--active::after {
		content: '';
		width: 4px;
		height: 4px;
		margin-top: 1px;
		border-radius: 999px;
		background: #4f5aff;
		box-shadow: 0 0 8px #4f5aff;
	}

	@keyframes fade-slide-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes orb-float {
		0% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(40px, -30px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 48px) scale(0.9);
		}
		100% {
			transform: translate(26px, 18px) scale(1.05);
		}
	}

	@keyframes notif-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.35);
			opacity: 0.62;
		}
	}

	@keyframes banner-zoom {
		0% {
			transform: scale(1) translateY(0);
		}
		100% {
			transform: scale(1.08) translateY(-10px);
		}
	}

	@keyframes eq-bounce {
		0% {
			height: 8px;
		}
		100% {
			height: var(--eq-h);
		}
	}

	@media (max-width: 1180px) {
		.header,
		.filter-tabs,
		.events-row,
		.rave-banner,
		.tickets-panel,
		.state-panel {
			margin-left: 24px;
			margin-right: 24px;
			padding-left: 0;
			padding-right: 0;
		}

		.events-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.header {
			padding: 24px 20px 14px;
		}

		.header-title {
			font-size: 34px;
		}

		.header-actions {
			gap: 6px;
		}

		.utility-btn {
			display: none;
		}

		.filter-tabs {
			padding: 0 20px 18px;
			margin: 0;
		}

		.events-row {
			display: flex;
			flex-direction: column;
			gap: 16px;
			padding: 0 20px 24px;
			margin: 0;
		}

		.event-card {
			height: 220px;
		}

		.card-title {
			font-size: 24px;
		}

		.rave-banner {
			height: 360px;
			margin: 0 20px;
		}

		.rave-banner-content {
			left: 20px;
			right: 20px;
			bottom: 20px;
			flex-direction: column;
			align-items: flex-start;
		}

		.rave-banner-text h2 {
			font-size: 42px;
		}

		.eq-visualizer {
			top: 20px;
			right: 20px;
		}

		.tickets-panel,
		.state-panel {
			margin: 0 20px 20px;
		}

		.tickets-list {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			animation-duration: 1ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 1ms !important;
		}
	}
</style>
