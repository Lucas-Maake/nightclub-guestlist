<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { currentUser, signOutCurrentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listPublishedEvents, listUserActiveTickets } from '$lib/firebase/firestore';
	import type { EventCatalogItem } from '$lib/data/events';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { UserActiveTicketRecord } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';

	type EventTab = 'events' | 'tickets';

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

	let activeTab = $state<EventTab>('events');
	let events = $state<EventCatalogItem[]>([]);
	let loadingEvents = $state(true);
	let eventsError = $state('');
	let loadingTickets = $state(false);
	let ticketsError = $state('');
	let tickets = $state<UserActiveTicketRecord[]>([]);

	const sortedEvents = $derived(
		[...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
	);
	const sortedTickets = $derived.by(() =>
		[...tickets].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
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

	async function loadTicketsFor(uid: string): Promise<void> {
		loadingTickets = true;
		ticketsError = '';
		try {
			tickets = await listUserActiveTickets(uid);
		} catch {
			tickets = [];
			ticketsError = 'Unable to load active tickets right now.';
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
						<p class="state-panel-muted" aria-live="polite">Loading events...</p>
					{:else if eventsError}
						<div class="state-panel-muted">
							<p>{eventsError}</p>
							<Button class="mt-3" size="sm" variant="outline" onclick={loadEvents}>Try again</Button>
						</div>
					{:else if sortedEvents.length === 0}
						<div class="state-panel-muted">
							<p>No published events yet.</p>
						</div>
					{:else}
						{#each sortedEvents as event (event.id)}
							<a
								href={`/event/${event.id}`}
								class="group block overflow-hidden rounded-2xl border border-border/70 bg-card/35 no-underline transition-transform duration-200 hover:-translate-y-0.5 hover:border-border/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
								aria-label={`Open ${event.title}`}
							>
								<div class={cn('relative min-h-[360px] p-4 sm:min-h-[390px]', event.posterClass)}>
									<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/12 to-black/75"></div>
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
							<Button class="mt-3" size="sm" onclick={handleSignIn}>Sign in</Button>
						</div>
					{:else if loadingTickets}
						<p class="state-panel-muted" aria-live="polite">Loading active tickets...</p>
					{:else if ticketsError}
						<p class="state-panel-error" aria-live="polite">{ticketsError}</p>
					{:else if sortedTickets.length === 0}
						<div class="state-panel-muted">
							<p>No active tickets yet.</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Choose an event to reserve a table once event details go live.
							</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each sortedTickets as ticket (ticket.reservationId)}
								<a
									href={`/r/${ticket.reservationId}`}
									class="block rounded-2xl border border-border/70 bg-card/40 p-4 no-underline transition-transform duration-200 hover:-translate-y-0.5 hover:border-border/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
				</TabsContent>
			{/if}
		</Tabs>
	</section>
</main>
