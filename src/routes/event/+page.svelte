<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { currentUser, signOutCurrentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { listUserActiveTickets } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { UserActiveTicketRecord } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';

	type EventTab = 'events' | 'tickets';

	type MockEvent = {
		id: string;
		title: string;
		venue: string;
		location: string;
		startAt: string;
		endAt: string;
		posterHeadline: string;
		posterClass: string;
	};

	const mockEvents: MockEvent[] = [
		{
			id: 'thursday-den',
			title: 'THURSDEN: Ray Lee / Tsubee / Jokah',
			venue: 'Den Social',
			location: 'Lower East Side, NYC',
			startAt: '2026-03-05T22:00:00-05:00',
			endAt: '2026-03-06T03:00:00-05:00',
			posterHeadline: 'THURSDEN',
			posterClass:
				'bg-[radial-gradient(circle_at_15%_20%,rgba(186,255,14,0.22),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(255,196,0,0.2),transparent_48%),linear-gradient(180deg,#162013_0%,#0b0d11_62%,#050609_100%)]'
		},
		{
			id: 'red-room',
			title: 'The Red Room: Reggae vs The World',
			venue: 'Decca Live',
			location: 'Brooklyn, NYC',
			startAt: '2026-03-06T22:00:00-05:00',
			endAt: '2026-03-07T02:00:00-05:00',
			posterHeadline: 'RED ROOM',
			posterClass:
				'bg-[radial-gradient(circle_at_14%_0%,rgba(255,154,72,0.2),transparent_33%),radial-gradient(circle_at_92%_18%,rgba(255,51,51,0.3),transparent_42%),linear-gradient(180deg,#51140f_0%,#21080d_58%,#09090b_100%)]'
		},
		{
			id: 'void-frequency',
			title: 'Void Frequency: Nova / Nira / Sync',
			venue: 'Monarch District',
			location: 'Midtown, NYC',
			startAt: '2026-03-07T23:00:00-05:00',
			endAt: '2026-03-08T04:00:00-05:00',
			posterHeadline: 'VOID',
			posterClass:
				'bg-[radial-gradient(circle_at_20%_10%,rgba(0,209,255,0.26),transparent_38%),radial-gradient(circle_at_84%_10%,rgba(235,93,255,0.3),transparent_44%),linear-gradient(180deg,#102334_0%,#111118_61%,#08090d_100%)]'
		},
		{
			id: 'saturday-atelier',
			title: 'Saturday Atelier: House + Disco Edit',
			venue: 'Keinemusik Hall',
			location: 'West Village, NYC',
			startAt: '2026-03-08T21:00:00-05:00',
			endAt: '2026-03-09T02:30:00-05:00',
			posterHeadline: 'ATELIER',
			posterClass:
				'bg-[radial-gradient(circle_at_80%_0%,rgba(248,179,81,0.26),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(150,255,218,0.2),transparent_42%),linear-gradient(180deg,#36220f_0%,#15151c_60%,#08080a_100%)]'
		}
	];

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
	let loadingTickets = $state(false);
	let ticketsError = $state('');
	let tickets = $state<UserActiveTicketRecord[]>([]);

	const sortedEvents = $derived.by(() =>
		[...mockEvents].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
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

	onMount(async () => {
		await waitForAuthReady();
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
				<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold tracking-[0.16em] text-primary">
					NG
				</span>
				<span class="text-sm font-semibold">Events</span>
			</a>
			{#if $currentUser}
				<Button variant="outline" size="sm" onclick={handleSignOut}>Sign out</Button>
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
					{#each sortedEvents as event (event.id)}
						<div class="overflow-hidden rounded-2xl border border-border/70 bg-card/35">
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
						</div>
					{/each}
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
								<div class="rounded-2xl border border-border/70 bg-card/40 p-4">
									<p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active ticket</p>
									<p class="mt-2 text-lg font-semibold">{ticket.clubName}</p>
									<p class="mt-1 text-sm text-muted-foreground">{ticketDateLine(ticket)}</p>
									<p class="mt-1 text-sm text-muted-foreground">Table: {ticket.tableType}</p>
									<p class="mt-1 text-sm text-muted-foreground">
										Guest: {ticket.guestDisplayName} {ticket.plusOneCount > 0 ? `(+${ticket.plusOneCount})` : ''}
									</p>
								</div>
							{/each}
						</div>
					{/if}
				</TabsContent>
			{/if}
		</Tabs>
	</section>
</main>
