# Runbook

## Prerequisites
- Node.js (recommended: 22 or 24 LTS for Firebase CLI compatibility)
- npm
- Firebase project with Auth + Firestore enabled
- Firebase CLI (`firebase-tools`) installed globally

## Environment Setup
1. Copy `.env.example` to `.env.local`.
2. Fill Firebase web config values:
   - `PUBLIC_FIREBASE_API_KEY`
   - `PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `PUBLIC_FIREBASE_PROJECT_ID`
   - `PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `PUBLIC_FIREBASE_APP_ID`
3. Optional local app origin:
   - `PUBLIC_APP_ORIGIN=http://localhost:5173`

## Local Development
- Install dependencies:
  - `npm install`
- Type + Svelte check:
  - `npm run check`
- Start app:
  - `npm run dev`

## Emulator Workflow
- Start Firebase emulators:
  - `firebase emulators:start --only auth,firestore`
- Start app in emulator mode:
  - `npm run dev:emulators`
- Emulator mode uses `.env.emulator` flags (`PUBLIC_FIREBASE_USE_EMULATORS=true`).

## Firestore Rules
- Rules file: `firestore.rules`
- Index file: `firestore.indexes.json`
- Deploy rules + indexes:
  - `npm run firebase:deploy`

## Build + Preview
- Build:
  - `npm run build`
- Preview:
  - `npm run preview`

## How To Test Quickly

### 1) Create reservation
- Open `/create`.
- Fill form fields and submit.
- If not logged in and debug disabled, confirm redirect to `/login`.

### 2) Share link open
- After create, confirm share screen appears with:
  - invite preview
  - copy invite link button
  - guest link format `/r/{reservationId}`

### 3) Debug login bypass
- Create with debug enabled.
- Open debug link `/r/{id}?debug=TOKEN` on `localhost` or `127.0.0.1`.
- Confirm automatic anonymous sign-in and no OTP prompt.
- Confirm same token flow is blocked on non-allowlisted production hostnames.

### 4) RSVP flow
- On `/r/{id}`, verify public details visible before auth.
- Click Join Guestlist and authenticate (or debug auth).
- Submit Accept/Decline + plus-ones.
- Confirm status chip + confirmation text update.

### 5) Host hub updates
- Open `/r/{id}/host` as reservation host.
- Confirm search + filter tabs work.
- Confirm RSVP changes from guest page appear in near real-time.

### 6) Check-in on iPad breakpoint
- Open `/r/{id}/checkin` and emulate `768x1024`.
- Confirm sticky search header, large check-in buttons, no horizontal scroll.
- Toggle check-in and verify status updates in host hub.
