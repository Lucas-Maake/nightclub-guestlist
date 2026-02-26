# Security

## Threat Model (MVP)
- Public users can open invite pages but should not access private guest details.
- Authenticated guests should only write their own RSVP document.
- Host-only workflows (guest list visibility, check-in toggles) must be restricted.
- Debug mode must not become a production auth bypass.

## Debug Mode Constraints

## Design
- Debug token is generated randomly in client when host enables debug.
- Only SHA-256 hash of token is stored in Firestore.
- Raw token exists only in generated debug URL shown to host immediately after create.

## Enforcement in app
- Debug auth is attempted only when:
  - URL includes `?debug=TOKEN`
  - reservation was debug-enabled
  - environment is `import.meta.env.DEV` or hostname is allowlisted:
    - `localhost`
    - `127.0.0.1`
    - `staging.*`
- On production hostnames, debug auth is blocked client-side.

## Auth result
- Successful debug validation signs in user with Firebase anonymous auth.
- This bypass is intended for local/staging QA only.

## Firestore Rules Summary
- `reservationPublic/{id}`:
  - public read
  - host create during reservation creation
  - direct client updates blocked (aggregate + visibility updates are callable-only)
- `reservations/{id}`:
  - create only by authenticated host owner
  - read/update/delete only by host
- `reservations/{id}/guests/{uid}`:
  - host can list/read all guest documents
  - guest can read own document
  - direct client writes blocked (RSVP/check-in are callable-only)
- `reservationPublic/{id}/attendees/{uid}`:
  - readable only when guest list is visible
  - direct client writes blocked (projection writes are callable-only)
- `users/{uid}`:
  - user-scoped read/write
- `reservationDebug/{id}`:
  - direct document `get` allowed (no list)
  - write gated to host ownership

## Privacy Notes
- Public page uses `reservationPublic` projection only.
- Private reservation and guest subcollection remain protected by rules.
- Phone numbers are not exposed in unauthenticated public documents.

## Known MVP Limits
- `reservationDebug` hash document is directly readable by ID for token verification.
  - Mitigation: long random token + SHA-256 + no list access + hostname gating.
- RSVP/check-in/visibility now depend on deployed callable Cloud Functions.
  - If functions are missing in an environment, those actions fail closed instead of allowing direct document writes.
