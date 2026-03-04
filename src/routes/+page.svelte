<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { Calendar, ChevronRight, MapPin, Ticket, UserCheck } from 'lucide-svelte';
	import { listPublishedEvents } from '$lib/firebase/firestore';
	import type { EventCatalogItem } from '$lib/data/events';

	let events = $state<EventCatalogItem[]>([]);
	let loadingEvents = $state(true);

	const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
	const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

	const upcomingEvents = $derived.by(() => {
		const now = Date.now();
		return [...events]
			.filter((e) => new Date(e.endAt).getTime() >= now)
			.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
			.slice(0, 3);
	});

	function eventPosterImage(event: EventCatalogItem): string {
		const overrides: Record<string, string> = {
			'thursday-den': '/images/events/den.png',
			'red-room': '/images/events/decca.png',
			'void-frequency': '/images/events/monarch.png',
			'saturday-atelier': '/images/events/mission.png'
		};
		return overrides[event.id] ?? event.posterImageUrl ?? '';
	}

	function eventDateShortLine(startAtIso: string): string {
		const start = new Date(startAtIso);
		return `${shortDateFormatter.format(start).toUpperCase()} · ${timeFormatter.format(start)}`;
	}

	onMount(async () => {
		try {
			events = await listPublishedEvents();
		} catch {
			events = [];
		} finally {
			loadingEvents = false;
		}
	});
</script>

<div class="relative min-h-screen overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div class="pointer-events-none absolute inset-0 bg-[url('/images/landing-minimal-bg.png')] bg-cover bg-center opacity-70"></div>
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.22),transparent_36%),radial-gradient(circle_at_50%_72%,rgba(5,5,7,0.94),rgba(5,5,7,1)_74%),linear-gradient(180deg,rgba(5,5,7,0.2)_0%,rgba(5,5,7,0.82)_58%,#050507_100%)]"
	></div>
	<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,7,0.62)_0%,rgba(5,5,7,0.1)_50%,rgba(5,5,7,0.62)_100%)]"></div>

	<div class="relative z-20">
		<AppHeader />
	</div>

	<main class="relative z-10 mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12">
		<div class="flex min-h-[calc(100vh-68px)] items-center justify-center py-20 lg:py-28">
			<div class="flex w-full max-w-[900px] flex-col items-center text-center">
				<div class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400"></span>
					<span class="text-[11px] uppercase tracking-[0.12em] text-violet-300" style="font-family: 'Space Mono', monospace;">
						Best Nightlife In America
					</span>
				</div>

				<h1 class="mt-8 max-w-[820px] text-6xl font-black uppercase leading-none tracking-tight text-white sm:text-7xl lg:text-8xl" style="font-family: 'Manrope', sans-serif; text-shadow: 0 12px 40px rgba(0,0,0,0.6);">
					Your night starts here
				</h1>

				<p class="mt-5 max-w-[480px] text-sm text-zinc-500">
					Curated events, reserved tables, and instant access — wherever the night takes you.
				</p>

				<div class="mt-9 flex flex-wrap items-center justify-center gap-3">
					<a
						href="/event"
						class="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 px-8 text-base font-bold text-white shadow-[0_0_32px_rgba(168,85,247,0.45)] transition duration-200 hover:scale-[1.03] hover:shadow-[0_0_52px_rgba(168,85,247,0.65)]"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						Explore Events
						<ArrowRight class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
					</a>
					<a
						href="#how-it-works"
						class="inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/60 px-7 text-base font-semibold text-zinc-300 backdrop-blur transition duration-200 hover:border-zinc-500 hover:text-white"
						style="font-family: 'Space Grotesk', sans-serif;"
					>
						How it works
					</a>
				</div>
			</div>
		</div>

		{#if loadingEvents || upcomingEvents.length > 0}
			<section class="pb-20 pt-4 lg:pb-28" aria-label="Upcoming events">
				<div class="mb-6 flex items-center justify-between">
					<h2 class="text-2xl font-extrabold uppercase tracking-[-0.02em] text-white sm:text-3xl" style="font-family: 'Space Grotesk', sans-serif;">
						Happening soon
					</h2>
					<a
						href="/event"
						class="inline-flex items-center gap-1 text-sm font-semibold text-violet-400 no-underline transition hover:text-violet-300"
					>
						View all <ChevronRight class="h-4 w-4" />
					</a>
				</div>

				{#if loadingEvents}
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
						{#each [1, 2, 3] as _ (_)}
							<div class="h-[300px] rounded-2xl border border-zinc-800 skeleton-shimmer"></div>
						{/each}
					</div>
				{:else}
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each upcomingEvents as event, i (event.id)}
							<a
								in:fly={{ y: 16, duration: 300, delay: i * 80, easing: cubicOut }}
								href={`/event/${event.id}`}
								class="group relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 no-underline transition hover:-translate-y-0.5 hover:border-violet-500/60"
							>
								<div class="absolute inset-0">
									{#if eventPosterImage(event)}
										<img
											class="h-full w-full object-cover"
											src={eventPosterImage(event)}
											alt={`Poster for ${event.title}`}
											loading="lazy"
											decoding="async"
										/>
									{:else}
										<div class="h-full w-full bg-[radial-gradient(circle_at_15%_15%,rgb(168_85_247_/_0.45),transparent_42%),radial-gradient(circle_at_82%_10%,rgb(34_211_238_/_0.3),transparent_50%),linear-gradient(180deg,#1b1b24_0%,#12121a_60%,#0e0e14_100%)]"></div>
									{/if}
									<div class="absolute inset-0 bg-gradient-to-b from-black/10 via-black/75 to-black/95"></div>
								</div>
								<div class="relative mt-auto flex flex-col gap-3 p-4">
									<h3 class="text-xl font-bold leading-tight text-white" style="font-family: 'Space Grotesk', sans-serif;">{event.title}</h3>
									<p class="inline-flex items-center gap-1.5 text-xs text-zinc-300">
										<Calendar class="h-3.5 w-3.5" />{eventDateShortLine(event.startAt)}
									</p>
									<div class="flex items-center justify-between gap-3">
										<p class="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-300">
											<MapPin class="h-3.5 w-3.5 shrink-0" />
											<span class="truncate">{event.venue}{event.location ? ` · ${event.location}` : ''}</span>
										</p>
										<span class="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-white">
											Details <ChevronRight class="h-3.5 w-3.5" />
										</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
		<section id="how-it-works" aria-labelledby="how-it-works-heading" class="border-t border-zinc-800/60 pb-24 pt-20">
			<h2 id="how-it-works-heading" class="mb-12 text-center text-2xl font-extrabold uppercase tracking-[-0.02em] text-white sm:text-3xl" style="font-family: 'Space Grotesk', sans-serif;">
				How it works
			</h2>
			<div class="grid gap-8 sm:grid-cols-3">
				{#each [
					{ n: '01', icon: Calendar, title: 'Browse events', desc: 'Discover upcoming nights curated across top venues in your city.' },
					{ n: '02', icon: Ticket, title: 'Reserve your spot', desc: 'Lock in a table or ticket in seconds — no forms, no waiting.' },
					{ n: '03', icon: UserCheck, title: 'Show up', desc: 'Flash your confirmation at the door and walk straight in.' }
				] as step (step.n)}
					{@const Icon = step.icon}
					<div class="flex flex-col items-center gap-4 text-center">
						<div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10">
							<Icon class="h-6 w-6 text-violet-400" />
						</div>
						<div>
							<p class="mb-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-violet-400" style="font-family: 'Space Mono', monospace;">{step.n}</p>
							<h3 class="text-lg font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">{step.title}</h3>
							<p class="mt-1 text-sm text-zinc-400">{step.desc}</p>
						</div>
					</div>
				{/each}
			</div>
		</section>
	</main>

	<footer class="relative z-10 w-full border-t border-zinc-800/50 bg-[#0e0e12]">
		<div class="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
			<span class="text-xs text-zinc-500">&copy; 2026 Apollo HQ</span>
			<span class="text-xs text-zinc-600">All rights reserved.</span>
		</div>
	</footer>
</div>
