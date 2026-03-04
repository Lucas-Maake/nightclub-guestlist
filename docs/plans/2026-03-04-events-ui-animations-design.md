# Events Page UI Animation Design

**Date:** 2026-03-04
**Scope:** `/event` page only
**Framework:** Motion (motion.dev)

## Changes

### 1. Badge cursor
Genre filter pills (All Events, Techno, House, DnB, Trance) — add `cursor-pointer` explicitly. They are `<button>` elements but Tailwind resets don't guarantee it everywhere.

### 2. CTA hover (Get Tickets / Request Table)
- **Get Tickets** (violet gradient): `hover:shadow-[0_0_40px_rgba(168,85,247,0.6)] hover:scale-[1.02] transition-all duration-200`
- **Request Table** (outlined): `hover:shadow-[0_0_24px_rgba(168,85,247,0.35)] hover:scale-[1.02] transition-all duration-200`
- Apply in both the featured event section and any cards that render these buttons

### 3. Card skeleton shimmer
Replace `animate-pulse` with a CSS `@keyframes shimmer` sweep — a moving gradient highlight that sweeps left-to-right, giving a more polished loading feel than the flat pulse. Add to `app.css`.

### 4. Card entrance animation (Motion)
When `filteredEvents` loads and renders, use Motion's `animate` + `stagger` to drive each event card from `{ y: 16, opacity: 0 }` to `{ y: 0, opacity: 1 }` with a 70ms stagger per card. Use a data attribute selector (e.g. `data-event-card`) to target cards. Trigger inside an `$effect` that runs after the DOM renders, using `afterUpdate` or a reactive Svelte action.

## Files Changed
- `package.json` — add `motion`
- `src/app.css` — add `@keyframes shimmer` + `.skeleton-shimmer` utility
- `src/routes/event/+page.svelte` — all four improvements applied inline
