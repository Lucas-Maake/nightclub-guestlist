# Nightclub Guestlist MVP Plan

## 1) Foundation + Project Setup
- [x] Add global SvelteKit app shell defaults (`ssr = false`) for client-side Firebase flows.
- [x] Configure Tailwind + theme tokens (dark-first, Apollo-inspired design language).
- [x] Add shared app styles, container utilities, spacing, typography, radii, shadows.
- [x] Create reusable UI primitives in shadcn-svelte style (`Button`, `Card`, `Input`, `Dialog`, `Tabs`, `Table`, `Badge`, `Textarea`, `Switch`, `Progress`).

Checkpoint:
- `npm run dev` starts without styling/runtime errors.

## 2) Firebase + Environment + Emulator Wiring
- [x] Create `src/lib/firebase/client.ts` for Firebase app initialization and env parsing.
- [x] Create `src/lib/firebase/auth.ts` for auth state, phone OTP, recaptcha, anonymous debug sign-in helpers.
- [x] Create `src/lib/firebase/firestore.ts` for typed document helpers and real-time listeners.
- [x] Add `.env.example` with required Firebase client keys.
- [x] Add Firebase emulator support (`firebase.json`, `.firebaserc`, scripts, emulator connect logic).

Checkpoint:
- App can run in local mode and connect to emulators when env flags are enabled.

## 3) Domain Model + Validation
- [x] Define TypeScript models and status enums for reservations/guests/users.
- [x] Add Zod schemas for create reservation, RSVP payload, plus-one list, and check-in updates.
- [x] Implement date/time helpers and token hash helper (SHA-256) for debug links.

Checkpoint:
- Inputs are validated client-side before Firestore writes.

## 4) Core Route Implementation
- [x] `/login`: phone OTP flow with reCAPTCHA, redirect back to original target.
- [x] `/create`: authenticated host flow (or debug-safe bypass), reservation form, Firestore create, debug token hash generation.
- [x] Share screen post-create: invite preview, copy invite link toast, debug link rendering when enabled.
- [x] `/r/[id]`: public reservation details, join CTA, login gate, RSVP accept/decline + plus-ones, capacity meter.
- [x] `/r/[id]/host`: host-only dashboard with search, status tabs, capacity, copy link.
- [x] `/r/[id]/checkin`: host-only fast door UI with search and large check-in toggle.

Checkpoint:
- Full happy-path works: create -> share -> guest RSVP -> host sees updates -> check-in.

## 5) Security Rules + Debug Constraints
- [x] Add `firestore.rules` implementing:
  - public read for public reservation docs
  - own-guest write only
  - host-only full guest list read
  - host-only check-in updates
- [x] Implement debug token handling:
  - random token generation
  - hash-only storage in Firestore
  - debug auth allowed only in dev/allowlisted hostnames
  - block debug bypass on production hostnames

Checkpoint:
- Rules align with data model and debug flow constraints.

## 6) Documentation + QA
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DECISIONS.md`
- [x] `docs/SECURITY.md`
- [x] `docs/RUNBOOK.md`
- [x] `docs/VISUAL_STYLE.md`
- [x] `docs/RESPONSIVE.md`
- [x] Include quick manual test checklist for create/share/debug/RSVP/host/check-in (mobile/tablet/desktop).

Checkpoint:
- `npm run check` passes (or issues documented) and docs cover operations + constraints.
