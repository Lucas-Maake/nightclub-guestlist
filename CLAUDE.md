# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nightclub guestlist management app built with SvelteKit 2, Firebase, and Tailwind CSS. Hosts create table reservations, share invite links, guests RSVP via phone OTP, and door staff check guests in.

## Development Commands

```bash
npm run dev                    # Start dev server (localhost:5173)
npm run dev:emulators          # Start with Firebase emulators
npm run build                  # Production build
npm run check                  # Type check + Svelte validation
npm run check:watch            # Type check in watch mode
npm run firebase:emulators     # Start Firebase emulators only
npm run firebase:deploy        # Deploy Firestore rules, indexes, functions
npm run firebase:seed:events   # Seed events collection
```

Firebase emulators run on: Auth (9099), Firestore (8080), Functions (5001), Hosting (5000), UI (4000).

## Technology Stack

- **SvelteKit 2** with Svelte 5 Runes syntax (`$state`, `$derived`)
- **Firebase**: Auth (phone OTP), Firestore (realtime listeners), Cloud Functions (callable)
- **Tailwind CSS v4** with dark-first theme (Apollo-inspired)
- **SSR disabled** - client-side only for Firebase auth flows
- **Zod** for schema validation
- **No test framework** - type checking via `svelte-check` only

## Architecture

### Core Data Flow

1. **Auth** (`src/lib/firebase/auth.ts`): Phone OTP via `setupRecaptcha()` → `sendPhoneOtp()` → `confirmPhoneOtp()`. Auth state in `currentUser` store. Debug mode allows anonymous auth with `?debug=TOKEN`.

2. **Firestore** (`src/lib/firebase/firestore.ts`): Realtime listeners (`listenToReservationPublic()`, `listenToGuest()`, etc.) for live updates. Write operations go through Cloud Functions for validation.

3. **Cloud Functions** (`functions/index.js`): `upsertGuestRsvp()`, `toggleGuestCheckIn()`, `setGuestListVisibility()` - all guest mutations enforced server-side.

### Route Structure

| Route | Purpose |
|-------|---------|
| `/r/[id]` | Public RSVP page (main guest view) |
| `/r/[id]/host` | Host dashboard (full guest list management) |
| `/r/[id]/checkin` | Door check-in UI (tablet-optimized) |
| `/create` | Host creates new reservation |
| `/event` | Events listing |
| `/event/[id]` | Event details & ticket booking |
| `/host/events` | Host's reservations dashboard |
| `/login` | Phone OTP login (supports `?returnTo=`) |

### Firestore Collections

- `reservations/{id}` - Private host data with `guests/`, `waitlist/`, `comments/` subcollections
- `reservationPublic/{id}` - Public projection (counts only) with `attendees/` subcollection
- `reservationDebug/{id}` - Debug token hash (dev only)
- `users/{uid}` - User profiles
- `events/{id}` - Event catalog with `ticketTiers/` subcollection

### Key Patterns

**Realtime Listeners**: Pages subscribe to Firestore snapshots, UI updates automatically. Always unsubscribe on component destroy.

**Optimistic Updates**: RSVP/check-in updates UI immediately, then calls function. Reverts on next snapshot if function fails.

**Component Library**: UI primitives in `src/lib/components/ui/` use CVA for variants. Common components (header, auth modal, toast) in `src/lib/components/common/`.

**Error Messages**: Function errors map to user-friendly messages via `src/lib/utils/messages.ts`.

## Design System

Dark theme with HSL tokens defined in `src/app.css`:
- Background: `hsl(220 18% 5%)`
- Card: `hsl(220 16% 8%)`
- Primary blue: `hsl(212 90% 56%)`
- Success green: `hsl(150 75% 40%)`

Mobile-first responsive: 360-430px → 768px tablet → 1024px+ desktop.

## Environment Variables

Required in `.env.local` (copy from `.env.emulator` for local dev):
```
PUBLIC_FIREBASE_API_KEY
PUBLIC_FIREBASE_AUTH_DOMAIN
PUBLIC_FIREBASE_PROJECT_ID
PUBLIC_FIREBASE_STORAGE_BUCKET
PUBLIC_FIREBASE_MESSAGING_SENDER_ID
PUBLIC_FIREBASE_APP_ID
PUBLIC_FIREBASE_USE_EMULATORS=true  # for emulator mode
```

## Documentation

Detailed docs in `docs/`:
- `ARCHITECTURE.md` - Data model, auth flows, realtime patterns
- `DECISIONS.md` - Product UX decisions
- `SECURITY.md` - Threat model, Firestore rules
- `RUNBOOK.md` - Setup and deployment
- `VISUAL_STYLE.md` - Design tokens and layout rules
