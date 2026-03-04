# Home Page Redesign — Design Doc

**Date:** 2026-03-04
**Audience:** Guests / nightlife-goers (consumer-facing)
**Approach:** Live Events Showcase (Approach B)

## Goal

Replace the hero-only page with a proper landing page that gives guests an immediate reason to stay and click through — using real event data as the primary selling point.

## Page Structure

### 1. Hero (refined)
- Keep cinematic background (`landing-minimal-bg.png`) with existing gradient overlays
- Layout: badge → headline → subheadline → two CTAs
- Headline: action-oriented (e.g. "Your night starts here")
- CTAs: `Explore Events` (primary violet pill) + `How it works` (ghost pill, anchors to section 3)
- More vertical breathing room than current layout

### 2. Upcoming Events (live Firestore data)
- Heading: "Happening soon" + "View all →" link to `/event`
- Fetch first 3–4 upcoming published events from Firestore
- 3-column grid on desktop, horizontal scroll on mobile
- Card: poster image, event name, date, venue, genre badge
- Loading skeleton while fetching; section hidden if no events
- Same data source as `/event` page (`listPublishedEvents`)

### 3. How it works
- 3 steps in a row: Browse → Reserve → Show up
- Number + icon + one-line description per step
- Subtle connector between steps

## Non-goals
- No footer CTA section (events section drives the action)
- No testimonials, stat bars, or B2B messaging
- No new Firestore collections or data models

## Components
- Reuse `listPublishedEvents` from `$lib/firebase/firestore`
- Reuse event card styles from `/event` page
- Reuse `AppHeader` and `BrandMark`
- All new markup lives in `src/routes/+page.svelte`
