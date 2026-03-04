# Events Page Animation Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cursor-pointer to genre badges, glow-pulse hover on CTAs, shimmer skeleton on loading cards, and Motion-powered staggered card entrance animation.

**Architecture:** All changes live in `src/routes/event/+page.svelte` and `src/app.css`. Motion (`motion` package) handles the JS-driven card entrance stagger. The shimmer skeleton is pure CSS keyframes — no JS. CTA hover effects are Tailwind utility classes. No new components needed.

**Tech Stack:** SvelteKit 2, Svelte 5 Runes, Tailwind CSS v4, Motion (motion.dev)

---

### Task 1: Install Motion

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install the package**

```bash
npm install motion
```

**Step 2: Verify install**

```bash
cat package.json | grep '"motion"'
```
Expected: `"motion": "^X.X.X"` in `dependencies`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install motion animation library"
```

---

### Task 2: Add shimmer skeleton keyframe to app.css

**Files:**
- Modify: `src/app.css`

**Step 1: Add keyframe + utility class after the existing `:root` block**

In `src/app.css`, after the closing `}` of the `@layer base` block, add:

```css
@layer utilities {
  .skeleton-shimmer {
    background: linear-gradient(
      90deg,
      hsl(220 16% 10%) 0%,
      hsl(220 16% 16%) 40%,
      hsl(220 16% 10%) 100%
    );
    background-size: 200% 100%;
    animation: skeleton-sweep 1.6s ease-in-out infinite;
  }
}

@keyframes skeleton-sweep {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Step 2: Type check**

```bash
npm run check
```
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat: add skeleton shimmer keyframe animation"
```

---

### Task 3: Badge cursor-pointer + CTA hover glow

**Files:**
- Modify: `src/routes/event/+page.svelte`

**Step 1: Add cursor-pointer to genre filter badges**

Find the genre filter buttons at line ~228. The current class string contains `transition`. Add `cursor-pointer` to both the active and inactive variants:

Current inactive class (partial):
```
border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-cyan-400/45 hover:text-white
```

Replace that segment with:
```
border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-cyan-400/45 hover:text-white cursor-pointer
```

And the active variant:
```
border-lime-300/50 bg-lime-300/10 text-lime-300
```
Add `cursor-pointer` there too.

Final button class (full):
```svelte
class={`h-8 whitespace-nowrap rounded-full border px-3 text-xs font-semibold uppercase tracking-wide transition cursor-pointer ${genreFilter === filter ? 'border-lime-300/50 bg-lime-300/10 text-lime-300' : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-cyan-400/45 hover:text-white'}`}
```

**Step 2: Add hover glow-pulse to "Get Tickets" CTA in featured event section (~line 252)**

Current:
```svelte
<a href={`/event/${featuredEvent.id}`} class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)]">{featuredEvent.salesMode === 'table-packages' ? 'View Packages' : 'Get Tickets'}</a>
```

Replace with:
```svelte
<a href={`/event/${featuredEvent.id}`} class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(168,85,247,0.65)] hover:scale-[1.03]">{featuredEvent.salesMode === 'table-packages' ? 'View Packages' : 'Get Tickets'}</a>
```

**Step 3: Add hover glow-pulse to "Request Table" CTA (~line 253)**

Current:
```svelte
<a href={`/event/${featuredEvent.id}/request-table`} class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm font-bold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white">Request Table</a>
```

Replace with:
```svelte
<a href={`/event/${featuredEvent.id}/request-table`} class="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm font-bold text-zinc-200 transition-all duration-200 hover:border-violet-400/60 hover:text-white hover:shadow-[0_0_24px_rgba(168,85,247,0.35)] hover:scale-[1.03]">Request Table</a>
```

**Step 4: Type check**

```bash
npm run check
```

**Step 5: Commit**

```bash
git add src/routes/event/+page.svelte
git commit -m "feat: badge cursor-pointer and CTA hover glow-pulse"
```

---

### Task 4: Replace animate-pulse with skeleton-shimmer

**Files:**
- Modify: `src/routes/event/+page.svelte`

**Step 1: Replace event card skeletons (~line 264)**

Find:
```svelte
<article class="h-[320px] rounded-2xl border border-zinc-800 bg-zinc-900/70 animate-pulse"></article>
```

Replace with:
```svelte
<article class="h-[320px] rounded-2xl border border-zinc-800 skeleton-shimmer"></article>
```

**Step 2: Replace sidebar soon-event skeletons (~line 317)**

Find:
```svelte
<div class="h-[74px] rounded-xl border border-zinc-800 bg-zinc-900/70 animate-pulse"></div>
```

Replace with:
```svelte
<div class="h-[74px] rounded-xl border border-zinc-800 skeleton-shimmer"></div>
```

**Step 3: Replace tickets skeleton (~line 350)**

Find:
```svelte
<article class="h-36 rounded-xl border border-zinc-800 bg-zinc-900/70 animate-pulse"></article>
```

Replace with:
```svelte
<article class="h-36 rounded-xl border border-zinc-800 skeleton-shimmer"></article>
```

**Step 4: Type check**

```bash
npm run check
```

**Step 5: Commit**

```bash
git add src/routes/event/+page.svelte
git commit -m "feat: replace pulse skeletons with shimmer sweep animation"
```

---

### Task 5: Motion staggered card entrance animation

**Files:**
- Modify: `src/routes/event/+page.svelte`

**Step 1: Import Motion at top of script block**

Add after the existing imports in `<script lang="ts">`:
```ts
import { animate, stagger } from 'motion';
```

**Step 2: Add data attribute to event cards (~line 284)**

Find the event card `<a>` tag:
```svelte
<a href={`/event/${event.id}`} class="group relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-0.5 hover:border-violet-500/60" style={`animation-delay:${index * 70}ms`}>
```

Replace with (add `data-event-card` attribute, remove the now-unnecessary inline animation-delay style):
```svelte
<a href={`/event/${event.id}`} data-event-card class="group relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 opacity-0 transition hover:-translate-y-0.5 hover:border-violet-500/60">
```

Note: `opacity-0` is the initial state — Motion will animate it to 1.

**Step 3: Add $effect to trigger Motion after cards render**

After the existing `$effect` blocks (around line 182), add:

```ts
$effect(() => {
  // Re-run whenever filteredEvents changes and cards are visible
  if (loadingEvents || filteredEvents.length === 0) return;

  // Small tick to let Svelte flush the DOM
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('[data-event-card]');
    if (cards.length === 0) return;
    animate(
      cards,
      { opacity: [0, 1], y: [20, 0] },
      { duration: 0.35, delay: stagger(0.07), easing: [0.22, 1, 0.36, 1] }
    );
  });
});
```

**Step 4: Type check**

```bash
npm run check
```

Expected: No errors. Motion ships its own types.

**Step 5: Verify visually**

```bash
npm run dev
```

Open `http://localhost:5173/event`. On load, cards should fan in from bottom with stagger. Genre filter switch should re-trigger the stagger. Skeletons should shimmer. CTAs should glow on hover. Badges should show pointer cursor.

**Step 6: Commit**

```bash
git add src/routes/event/+page.svelte
git commit -m "feat: Motion staggered card entrance animation on events page"
```
