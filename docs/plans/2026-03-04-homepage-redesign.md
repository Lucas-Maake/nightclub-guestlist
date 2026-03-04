# Home Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hero-only home page with a proper landing page: refined hero → live upcoming events grid → how it works steps → footer.

**Architecture:** All changes confined to `src/routes/+page.svelte`. Reuse `listPublishedEvents` from `$lib/firebase/firestore`, event card markup patterns from the events page, and the existing footer/skeleton styles.

**Tech Stack:** SvelteKit 2, Svelte 5 Runes, Tailwind CSS v4, lucide-svelte icons, motion (animation), svelte/transition (fly)

---

### Task 1: Refine the hero section

**Files:**
- Modify: `src/routes/+page.svelte`

**Context:**
Current hero is: badge → logo+h1 side-by-side → tagline → one CTA button. It needs more breathing room and a second ghost CTA that anchors to the how-it-works section.

**Step 1: Replace the hero markup**

Open `src/routes/+page.svelte`. Replace the entire `<section>` inside `<main>` with:

```svelte
<section class="flex w-full max-w-[900px] flex-col items-center text-center">
	<div class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2">
		<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400"></span>
		<span class="text-[11px] uppercase tracking-[0.12em] text-violet-300" style="font-family: 'Space Mono', monospace;">
			Best Nightlife In America
		</span>
	</div>

	<div class="mt-8 flex items-center justify-center gap-4">
		<BrandMark class="h-10 w-10 shrink-0 sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
		<h1 class="text-5xl font-extrabold uppercase leading-none tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl" style="font-family: 'Space Grotesk', sans-serif; text-shadow: 0 12px 34px rgba(0,0,0,0.5);">
			Apollo HQ
		</h1>
	</div>

	<p class="mt-5 max-w-[520px] text-lg font-medium text-zinc-300 sm:text-xl">
		Your night starts here.
	</p>
	<p class="mt-2 max-w-[480px] text-sm text-zinc-500">
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
</section>
```

Also update `<main>` to give the hero more vertical padding and allow content below:

Replace:
```svelte
<main class="relative z-10 mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-[1440px] items-center justify-center px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
```
With:
```svelte
<main class="relative z-10 mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12">
	<div class="flex min-h-[calc(100vh-68px)] items-center justify-center py-20 lg:py-28">
```

And close the new `<div>` after the `</section>` (before `</main>`):
```svelte
	</div>
```

**Step 2: Verify the hero renders**

Run: `npm run check`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: refine homepage hero — stronger headline, ghost how-it-works CTA"
```

---

### Task 2: Add live upcoming events section

**Files:**
- Modify: `src/routes/+page.svelte`

**Context:**
Need to fetch events with `listPublishedEvents`, show first 3 sorted upcoming events as poster cards (same card style as `/event`), with a loading skeleton and "View all" link. Section is hidden entirely if no events exist after loading.

**Step 1: Add script imports and state**

At the top of the `<script lang="ts">` block, add these imports and state:

```svelte
import { onMount } from 'svelte';
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { Calendar, MapPin, ChevronRight } from 'lucide-svelte';
import { listPublishedEvents } from '$lib/firebase/firestore';
import type { EventCatalogItem } from '$lib/data/events';
```

Add state variables:
```svelte
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
```

**Step 2: Add the events section markup**

After the closing `</div>` of the hero wrapper (and before `</main>`), add:

```svelte
{#if loadingEvents || upcomingEvents.length > 0}
	<section class="pb-20 pt-4 lg:pb-28">
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
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each [1, 2, 3] as _}
					<div class="h-[300px] rounded-2xl border border-zinc-800 skeleton-shimmer"></div>
				{/each}
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each upcomingEvents as event, i (event.id)}
					<a
						in:fly={{ y: 16, duration: 300, delay: i * 80, easing: cubicOut }}
						href={`/event/${event.id}`}
						class="group relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-0.5 hover:border-violet-500/60"
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
```

**Step 3: Check types**

Run: `npm run check`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add live upcoming events section to homepage"
```

---

### Task 3: Add "How it works" section and footer

**Files:**
- Modify: `src/routes/+page.svelte`

**Context:**
Three steps: Browse → Reserve → Show up. Each has a step number, a short title, and a one-line description. Section has `id="how-it-works"` for the hero anchor. Add a minimal footer matching the events page.

**Step 1: Add Ticket icon import**

In the `<script>` imports, add `Ticket` and `UserCheck` to the lucide-svelte import:

```svelte
import { Calendar, ChevronRight, MapPin, Ticket, UserCheck } from 'lucide-svelte';
```

**Step 2: Add how-it-works section and footer markup**

After the events section (still inside `</main>`) but before `</main>`, add:

```svelte
<section id="how-it-works" class="border-t border-zinc-800/60 pb-24 pt-20">
	<h2 class="mb-12 text-center text-2xl font-extrabold uppercase tracking-[-0.02em] text-white sm:text-3xl" style="font-family: 'Space Grotesk', sans-serif;">
		How it works
	</h2>
	<div class="grid gap-8 sm:grid-cols-3">
		{#each [
			{ n: '01', icon: Calendar, title: 'Browse events', desc: 'Discover upcoming nights curated across top venues in your city.' },
			{ n: '02', icon: Ticket, title: 'Reserve your spot', desc: 'Lock in a table or ticket in seconds — no forms, no waiting.' },
			{ n: '03', icon: UserCheck, title: 'Show up', desc: 'Flash your confirmation at the door and walk straight in.' }
		] as step, i (step.n)}
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10">
					<svelte:component this={step.icon} class="h-6 w-6 text-violet-400" />
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
```

Close `</main>`, then add footer:

```svelte
</main>

<footer class="relative z-10 w-full border-t border-zinc-800/50 bg-[#0e0e12]">
	<div class="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
		<span class="text-xs text-zinc-500">&copy; 2026 Apollo HQ</span>
		<span class="text-xs text-zinc-600">All rights reserved.</span>
	</div>
</footer>
```

Remove the old `</main>` that was at the end and make sure the outer `<div>` closes properly.

**Step 3: Check types**

Run: `npm run check`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add how-it-works section and footer to homepage"
```

---

### Task 4: Final check and cleanup

**Files:**
- Modify: `src/routes/+page.svelte` (if needed)

**Step 1: Run dev server and visually verify**

Run: `npm run dev`

Check at `localhost:5173`:
- [ ] Hero: badge → logo+title → two-line tagline → two CTAs
- [ ] "How it works" ghost CTA scrolls to the section
- [ ] Events section shows skeleton then 3 cards
- [ ] Cards link to `/event/[id]`
- [ ] "View all" links to `/event`
- [ ] How it works: 3 steps visible
- [ ] Footer present

**Step 2: Fix any visual issues found**

Adjust spacing, font sizes, or colours as needed.

**Step 3: Final commit**

```bash
git add src/routes/+page.svelte
git commit -m "fix: homepage polish after visual review"
```
