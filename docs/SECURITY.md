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
  - host/admin-style create/delete
  - constrained aggregate updates from signed-in users
- `reservations/{id}`:
  - create only by authenticated host owner
  - read/update/delete only by host
- `reservations/{id}/guests/{uid}`:
  - guest can create/update own document
  - host can list/read/update all guest documents
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
- `acceptedCount/declinedCount` are aggregate counters and constrained in rules, but still mutable by signed-in clients.
  - Mitigation: transaction-based updates + bounded rule checks; tighten with server-side functions in next iteration.
