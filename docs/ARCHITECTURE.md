# Architecture

## Stack
- SvelteKit + TypeScript
- Tailwind CSS (dark-first tokenized theme)
- shadcn-svelte style component primitives in `src/lib/components/ui/*`
- Firebase Web SDK:
  - Auth (phone OTP + reCAPTCHA)
  - Firestore (realtime listeners + transactions)
  - Hosting/Emulator configuration files

## Route Map
- `/create`
  - Host reservation form
  - Optional debug toggle
  - Creates reservation + share payload
- `/login`
  - Phone OTP sign-in
  - Redirects to `returnTo`
- `/r/[id]`
  - Public reservation details before login
  - Debug token handling (`?debug=TOKEN`)
  - Authenticated RSVP + plus-ones
- `/r/[id]/host`
  - Host-only guest management
  - Search + status filters + capacity metrics
- `/r/[id]/checkin`
  - Host-only door check-in surface
  - Large controls for tablet workflow

## Data Model

### Private reservation document
`reservations/{reservationId}`
- `clubName`
- `startAt` (timestamp)
- `tableType`
- `capacity`
- `notes`
- `dressCode`
- `hostUid`
- `createdAt`
- `debugEnabled`
- `debugTokenHash` (optional, hash only)

### Guest documents
`reservations/{reservationId}/guests/{uid}`
- `displayName`
- `phone`
- `status` (`invited | accepted | declined`)
- `plusOnes` (`[{ name }]`)
- `checkedInAt` (timestamp or null)
- `checkedInBy` (uid or null)
- `updatedAt`

### User documents
`users/{uid}`
- `phone`
- `displayName` (optional)
- `createdAt`
- `lastSeenAt`

### Public projection (for invite page)
`reservationPublic/{reservationId}`
- Public-safe reservation fields
- `acceptedCount`
- `declinedCount`
- `updatedAt`

### Debug auth projection
`reservationDebug/{reservationId}`
- `reservationId`
- `hostUid`
- `debugTokenHash`
- `createdAt`

## Auth Flows

### Standard flow
1. User opens `/login`.
2. Firebase `RecaptchaVerifier` renders.
3. OTP sent via `signInWithPhoneNumber`.
4. Code confirmed.
5. User is redirected back to `returnTo`.

### Debug flow
1. Host creates reservation with `debugEnabled`.
2. Client generates random token and stores only SHA-256 hash in Firestore.
3. Share/debug link: `/r/{id}?debug=TOKEN`.
4. On `/r/{id}`, app checks:
   - hostname is dev/allowlisted
   - token hash matches stored hash
5. If valid, user signs in anonymously (OTP bypass only for approved hosts).

## Realtime + Optimistic Updates
- Realtime reads:
  - Reservation public data
  - Host guest list
  - Current user guest document
- Optimistic writes:
  - RSVP state updates immediately in UI before Firestore commit
  - Check-in toggles optimistically in door UI
- Source of truth remains Firestore snapshots.
