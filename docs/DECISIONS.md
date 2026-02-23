# Decisions

## Product + UX Decisions

### 1) Public-first invite page before login
- Decision: `/r/[id]` renders reservation details without auth, but RSVP write requires login.
- Why: mirrors event/invite mental model and reduces drop-off before commitment.
- Tradeoff: public page must use a privacy-safe projection (`reservationPublic`), not private docs.

### 2) Phone OTP as primary auth
- Decision: Firebase phone provider for host + guest authentication.
- Why: lowest-friction identity for nightlife attendance and door operations.
- Tradeoff: requires reCAPTCHA and OTP UX handling.

### 3) Separate host + check-in surfaces
- Decision: `/r/[id]/host` and `/r/[id]/checkin` are separate optimized screens.
- Why: host dashboard is info-dense; door mode prioritizes speed/tap targets.
- Tradeoff: duplicated routing context, but clearer operational UX.

### 4) Debug/Backdoor mode for QA only
- Decision: token-based bypass with hash-only storage and hostname constraints.
- Why: supports rapid local testing without repeatedly triggering OTP.
- Tradeoff: adds a controlled auth exception that must be tightly documented and scoped.

## Technical Decisions

### 5) SvelteKit + client-side Firebase
- Decision: `ssr = false` and client-first data flow for MVP.
- Why: simplifies Firebase Auth integration and route-level real-time interactions.
- Tradeoff: less SEO/server rendering value, acceptable for operations-first MVP.

### 6) Firestore realtime + transactions
- Decision: live listeners for reservation and guest state; transaction for RSVP aggregate counters.
- Why: host and door screens need immediate consistency.
- Tradeoff: counter updates are constrained by rules but still a known trust boundary in MVP.

### 7) Data privacy split
- Decision: keep private host fields in `reservations/*`; expose invite-safe fields in `reservationPublic/*`.
- Why: avoids leaking host/guest/private metadata to unauthenticated invite traffic.
- Tradeoff: dual-write on create and maintenance of aggregated counts.

### 8) Apollo-inspired visual language
- Decision: dark-first design tokens, rounded premium surfaces, sparse cool-blue accents.
- Why: aligns with hospitality-tech positioning and user requirement to match Apollo tone.
- Tradeoff: requires disciplined restraint (no loud gradients, no heavy color noise).
