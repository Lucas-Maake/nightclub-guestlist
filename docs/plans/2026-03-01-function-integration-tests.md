# Cloud Function Integration Test Harness

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Vitest test suite in `functions/tests/` that runs all 5 Cloud Functions against the Firebase emulator to prevent regressions.

**Architecture:** Tests live in `functions/tests/` as `.mjs` files (always ESM, even in the CommonJS `functions/` package). A `globalSetup` auto-spawns the Firebase emulator suite and waits for "All emulators ready!" before any test runs, then kills it on teardown. `firebase-admin` seeds test data and clears Firestore between tests via the emulator REST API. Each of the 5 Cloud Functions gets exactly one test file. Tests call functions over HTTP to the local emulator — no direct imports of function code.

**Tech Stack:** Vitest 4 (root devDep, run from root), firebase-admin 13 (root devDep), Firebase emulators (Auth:9099, Firestore:8080, Functions:5001), Node environment (no jsdom). Test files are `.mjs` so they are always treated as ESM regardless of `functions/package.json` `"type": "commonjs"`.

---

### Task 1: Vitest config + npm script

**Files:**
- Create: `functions/vitest.config.mjs`
- Modify: `package.json` (root)

**Step 1: Create `functions/vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/global-setup.mjs'],
    testTimeout: 15000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});
```

`singleFork: true` runs all test files sequentially in one process — avoids firebase-admin initialization races and keeps emulator interaction simple.

**Step 2: Add `test:functions` to root `package.json` scripts**

Add after the existing `test:e2e:ui` entry:
```json
"test:functions": "vitest run --config functions/vitest.config.mjs --reporter verbose"
```

**Step 3: Verify config parses (dry run)**

```bash
npx vitest --config functions/vitest.config.mjs --reporter verbose 2>&1 | head -20
```

Expected: Vitest starts, prints version, then exits (no test files yet).

**Step 4: Commit**

```bash
git add functions/vitest.config.mjs package.json
git commit -m "test: add vitest config for Cloud Function integration tests"
```

---

### Task 2: Global setup — emulator lifecycle

**Files:**
- Create: `functions/tests/global-setup.mjs`

**Step 1: Create `functions/tests/global-setup.mjs`**

```js
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

let emulatorProcess = null;
let startedByUs = false;

async function isEmulatorRunning() {
  try {
    await fetch('http://127.0.0.1:5001');
    return true;
  } catch {
    return false;
  }
}

export async function setup() {
  if (await isEmulatorRunning()) {
    console.log('[test] Emulators already running, skipping startup');
    return;
  }

  console.log('[test] Starting Firebase emulators...');
  emulatorProcess = spawn(
    'firebase',
    ['emulators:start', '--only', 'auth,firestore,functions'],
    {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  startedByUs = true;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Firebase emulators did not start within 90s'));
    }, 90000);

    emulatorProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(`[emulator] ${text}`);
      if (text.includes('All emulators ready!')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    emulatorProcess.stderr.on('data', (data) => {
      process.stderr.write(`[emulator] ${data}`);
    });

    emulatorProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    emulatorProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Emulator process exited with code ${code}`));
      }
    });
  });

  console.log('[test] Emulators ready');
}

export async function teardown() {
  if (startedByUs && emulatorProcess) {
    console.log('[test] Stopping emulators...');
    emulatorProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
  }
}
```

**Step 2: Verify globalSetup exports are valid**

```bash
node --input-type=module <<'EOF'
import('./functions/tests/global-setup.mjs').then(m => {
  console.log('exports:', Object.keys(m));
});
EOF
```

Expected: `exports: [ 'setup', 'teardown' ]`

**Step 3: Commit**

```bash
git add functions/tests/global-setup.mjs
git commit -m "test: add emulator global setup/teardown"
```

---

### Task 3: Test helpers

**Files:**
- Create: `functions/tests/helpers.mjs`

**Step 1: Create `functions/tests/helpers.mjs`**

```js
import { initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'nightclub-guestlist';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;
const FIRESTORE_EMULATOR = `http://127.0.0.1:8080`;

// Must be set before initializeApp is called
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

let _app;

function adminApp() {
  if (!_app) {
    try {
      _app = getApp('test');
    } catch {
      _app = initializeApp({ projectId: PROJECT_ID }, 'test');
    }
  }
  return _app;
}

export function db() {
  return getFirestore(adminApp());
}

export async function clearFirestore() {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`clearFirestore failed: HTTP ${res.status}`);
  }
}

export async function getIdToken(uid) {
  const customToken = await getAuth(adminApp()).createCustomToken(uid);
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const data = await res.json();
  if (!data.idToken) {
    throw new Error(`Failed to get ID token: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

export async function callFunction(name, data, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data })
  });

  const json = await res.json();

  if (json.error) {
    const err = new Error(json.error.message);
    err.status = json.error.status;
    throw err;
  }

  return json.result;
}

export async function seedReservation(reservationId, opts = {}) {
  const { capacity = 10, hostUid = 'host-uid', acceptedCount = 0 } = opts;
  const firestore = db();
  const batch = firestore.batch();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);

  batch.set(firestore.doc(`reservations/${reservationId}`), {
    clubName: 'Test Club',
    hostUid,
    capacity,
    tableType: 'VIP Table',
    startAt: tomorrow,
    notes: '',
    dressCode: '',
    createdAt: now,
    debugEnabled: false
  });

  batch.set(firestore.doc(`reservationPublic/${reservationId}`), {
    reservationId,
    clubName: 'Test Club',
    capacity,
    tableType: 'VIP Table',
    startAt: tomorrow,
    notes: '',
    dressCode: '',
    guestListVisibility: 'hidden',
    acceptedCount,
    declinedCount: 0,
    debugEnabled: false,
    updatedAt: now
  });

  await batch.commit();
}

export async function seedGuest(reservationId, uid, opts = {}) {
  const { status = 'accepted' } = opts;
  await db().doc(`reservations/${reservationId}/guests/${uid}`).set({
    displayName: 'Test Guest',
    phone: '+15555551234',
    status,
    plusOnes: [],
    checkedInAt: null,
    checkedInBy: null,
    updatedAt: new Date()
  });
}

export async function seedEvent(eventId, opts = {}) {
  const { published = true, priceCents = 1500, maxPerOrder = 4 } = opts;
  const firestore = db();
  const batch = firestore.batch();
  const now = new Date();

  batch.set(firestore.doc(`events/${eventId}`), {
    title: 'Test Bash',
    venue: 'Club Test',
    location: 'Los Angeles, CA',
    startAt: new Date(now.getTime() + 86400000),
    endAt: new Date(now.getTime() + 90000000),
    published,
    dressCode: 'Smart casual'
  });

  batch.set(firestore.doc(`events/${eventId}/ticketTiers/tier-ga`), {
    label: 'General Admission',
    priceCents,
    maxPerOrder,
    sortOrder: 1
  });

  await batch.commit();
}
```

**Step 2: Verify helpers import without error**

```bash
node --input-type=module <<'EOF'
import('./functions/tests/helpers.mjs').then(m => {
  console.log('exports:', Object.keys(m).join(', '));
});
EOF
```

Expected: `exports: db, clearFirestore, getIdToken, callFunction, seedReservation, seedGuest, seedEvent`

**Step 3: Commit**

```bash
git add functions/tests/helpers.mjs
git commit -m "test: add emulator test helpers (clearFirestore, seeders, callFunction)"
```

---

### Task 4: `upsertGuestRsvp` tests

**Files:**
- Create: `functions/tests/upsert-guest-rsvp.test.mjs`

**Step 1: Create the test file**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestore,
  getIdToken,
  callFunction,
  seedReservation,
  db
} from './helpers.mjs';

const RES_ID = 'res-rsvp';
const HOST_UID = 'host-rsvp';
const GUEST_UID = 'guest-rsvp';

const validPayload = {
  reservationId: RES_ID,
  status: 'accepted',
  displayName: 'Ada Lovelace',
  phone: '+15555551234',
  plusOnes: []
};

beforeEach(async () => {
  await clearFirestore();
  await seedReservation(RES_ID, { hostUid: HOST_UID, capacity: 5 });
});

describe('upsertGuestRsvp', () => {
  it('requires authentication', async () => {
    await expect(
      callFunction('upsertGuestRsvp', validPayload)
    ).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });

  it('throws NOT_FOUND for unknown reservation', async () => {
    const token = await getIdToken(GUEST_UID);
    await expect(
      callFunction('upsertGuestRsvp', { ...validPayload, reservationId: 'no-such-res' }, token)
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
  });

  it('creates guest doc and increments acceptedCount', async () => {
    const token = await getIdToken(GUEST_UID);
    const result = await callFunction('upsertGuestRsvp', validPayload, token);

    expect(result).toEqual({ ok: true });

    const guestSnap = await db().doc(`reservations/${RES_ID}/guests/${GUEST_UID}`).get();
    expect(guestSnap.exists).toBe(true);
    expect(guestSnap.get('status')).toBe('accepted');
    expect(guestSnap.get('displayName')).toBe('Ada Lovelace');

    const publicSnap = await db().doc(`reservationPublic/${RES_ID}`).get();
    expect(publicSnap.get('acceptedCount')).toBe(1);
    expect(publicSnap.get('declinedCount')).toBe(0);
  });

  it('writes formatted namePublic to attendee doc', async () => {
    const token = await getIdToken(GUEST_UID);
    await callFunction('upsertGuestRsvp', validPayload, token);

    const attendeeSnap = await db()
      .doc(`reservationPublic/${RES_ID}/attendees/${GUEST_UID}`)
      .get();
    expect(attendeeSnap.exists).toBe(true);
    // "Ada Lovelace" → "Ada L."
    expect(attendeeSnap.get('namePublic')).toBe('Ada L.');
    expect(attendeeSnap.get('status')).toBe('accepted');
  });

  it('increments declinedCount when declining', async () => {
    const token = await getIdToken(GUEST_UID);
    await callFunction('upsertGuestRsvp', { ...validPayload, status: 'declined' }, token);

    const publicSnap = await db().doc(`reservationPublic/${RES_ID}`).get();
    expect(publicSnap.get('acceptedCount')).toBe(0);
    expect(publicSnap.get('declinedCount')).toBe(1);
  });

  it('adjusts counts correctly when switching accepted → declined', async () => {
    const token = await getIdToken(GUEST_UID);
    await callFunction('upsertGuestRsvp', { ...validPayload, status: 'accepted' }, token);
    await callFunction('upsertGuestRsvp', { ...validPayload, status: 'declined' }, token);

    const publicSnap = await db().doc(`reservationPublic/${RES_ID}`).get();
    expect(publicSnap.get('acceptedCount')).toBe(0);
    expect(publicSnap.get('declinedCount')).toBe(1);
  });

  it('throws RSVP_CAPACITY_FULL when at capacity', async () => {
    // Re-seed with capacity=1, already 1 accepted
    await seedReservation(RES_ID, { hostUid: HOST_UID, capacity: 1, acceptedCount: 1 });
    const token = await getIdToken(GUEST_UID);

    await expect(
      callFunction('upsertGuestRsvp', validPayload, token)
    ).rejects.toMatchObject({ message: expect.stringContaining('RSVP_CAPACITY_FULL') });
  });

  it('stores plus-ones in guest doc', async () => {
    const token = await getIdToken(GUEST_UID);
    await callFunction('upsertGuestRsvp', {
      ...validPayload,
      plusOnes: [{ name: 'Charles Babbage' }, { name: 'Grace Hopper' }]
    }, token);

    const guestSnap = await db().doc(`reservations/${RES_ID}/guests/${GUEST_UID}`).get();
    expect(guestSnap.get('plusOnes')).toHaveLength(2);
    expect(guestSnap.get('plusOnes')[0].name).toBe('Charles Babbage');
  });

  it('rejects more than 4 plus-ones', async () => {
    const token = await getIdToken(GUEST_UID);
    await expect(
      callFunction('upsertGuestRsvp', {
        ...validPayload,
        plusOnes: [1, 2, 3, 4, 5].map((n) => ({ name: `Guest ${n}` }))
      }, token)
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });
});
```

**Step 2: Run tests**

```bash
npm run test:functions -- --reporter verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|Error)"
```

Expected: 8 passing tests for `upsertGuestRsvp`.

**Step 3: Commit**

```bash
git add functions/tests/upsert-guest-rsvp.test.mjs
git commit -m "test: upsertGuestRsvp integration tests (8 cases)"
```

---

### Task 5: `toggleGuestCheckIn` tests

**Files:**
- Create: `functions/tests/toggle-check-in.test.mjs`

**Step 1: Create the test file**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestore,
  getIdToken,
  callFunction,
  seedReservation,
  seedGuest,
  db
} from './helpers.mjs';

const RES_ID = 'res-checkin';
const HOST_UID = 'host-checkin';
const GUEST_UID = 'guest-checkin';

beforeEach(async () => {
  await clearFirestore();
  await seedReservation(RES_ID, { hostUid: HOST_UID });
  await seedGuest(RES_ID, GUEST_UID);
});

describe('toggleGuestCheckIn', () => {
  it('requires authentication', async () => {
    await expect(
      callFunction('toggleGuestCheckIn', { reservationId: RES_ID, uid: GUEST_UID, checkedIn: true })
    ).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });

  it('rejects non-host', async () => {
    const token = await getIdToken('random-user');
    await expect(
      callFunction('toggleGuestCheckIn', { reservationId: RES_ID, uid: GUEST_UID, checkedIn: true }, token)
    ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  });

  it('throws NOT_FOUND for unknown reservation', async () => {
    const token = await getIdToken(HOST_UID);
    await expect(
      callFunction('toggleGuestCheckIn', { reservationId: 'no-such-res', uid: GUEST_UID, checkedIn: true }, token)
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
  });

  it('sets checkedInAt and checkedInBy when checking in', async () => {
    const token = await getIdToken(HOST_UID);
    const result = await callFunction(
      'toggleGuestCheckIn',
      { reservationId: RES_ID, uid: GUEST_UID, checkedIn: true },
      token
    );

    expect(result).toEqual({ ok: true });

    const guestSnap = await db().doc(`reservations/${RES_ID}/guests/${GUEST_UID}`).get();
    expect(guestSnap.get('checkedInAt')).not.toBeNull();
    expect(guestSnap.get('checkedInBy')).toBe(HOST_UID);
  });

  it('clears checkedInAt and checkedInBy when unchecking', async () => {
    const token = await getIdToken(HOST_UID);
    // check in first
    await callFunction('toggleGuestCheckIn', { reservationId: RES_ID, uid: GUEST_UID, checkedIn: true }, token);
    // then undo
    await callFunction('toggleGuestCheckIn', { reservationId: RES_ID, uid: GUEST_UID, checkedIn: false }, token);

    const guestSnap = await db().doc(`reservations/${RES_ID}/guests/${GUEST_UID}`).get();
    expect(guestSnap.get('checkedInAt')).toBeNull();
    expect(guestSnap.get('checkedInBy')).toBeNull();
  });
});
```

**Step 2: Run tests**

```bash
npm run test:functions -- --reporter verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|Error)"
```

Expected: 5 passing for `toggleGuestCheckIn` (8 total from previous task still pass).

**Step 3: Commit**

```bash
git add functions/tests/toggle-check-in.test.mjs
git commit -m "test: toggleGuestCheckIn integration tests (5 cases)"
```

---

### Task 6: `setGuestListVisibility` tests

**Files:**
- Create: `functions/tests/set-guest-list-visibility.test.mjs`

**Step 1: Create the test file**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestore,
  getIdToken,
  callFunction,
  seedReservation,
  db
} from './helpers.mjs';

const RES_ID = 'res-visibility';
const HOST_UID = 'host-visibility';

beforeEach(async () => {
  await clearFirestore();
  await seedReservation(RES_ID, { hostUid: HOST_UID });
});

describe('setGuestListVisibility', () => {
  it('requires authentication', async () => {
    await expect(
      callFunction('setGuestListVisibility', { reservationId: RES_ID, visibility: 'visible' })
    ).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });

  it('rejects non-host', async () => {
    const token = await getIdToken('not-the-host');
    await expect(
      callFunction('setGuestListVisibility', { reservationId: RES_ID, visibility: 'visible' }, token)
    ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  });

  it('throws NOT_FOUND for unknown reservation', async () => {
    const token = await getIdToken(HOST_UID);
    await expect(
      callFunction('setGuestListVisibility', { reservationId: 'no-such-res', visibility: 'visible' }, token)
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
  });

  it('rejects invalid visibility value', async () => {
    const token = await getIdToken(HOST_UID);
    await expect(
      callFunction('setGuestListVisibility', { reservationId: RES_ID, visibility: 'public' }, token)
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });

  it('sets guestListVisibility to visible', async () => {
    const token = await getIdToken(HOST_UID);
    const result = await callFunction(
      'setGuestListVisibility',
      { reservationId: RES_ID, visibility: 'visible' },
      token
    );

    expect(result).toEqual({ ok: true });

    const snap = await db().doc(`reservationPublic/${RES_ID}`).get();
    expect(snap.get('guestListVisibility')).toBe('visible');
  });

  it('sets guestListVisibility back to hidden', async () => {
    const token = await getIdToken(HOST_UID);
    await callFunction('setGuestListVisibility', { reservationId: RES_ID, visibility: 'visible' }, token);
    await callFunction('setGuestListVisibility', { reservationId: RES_ID, visibility: 'hidden' }, token);

    const snap = await db().doc(`reservationPublic/${RES_ID}`).get();
    expect(snap.get('guestListVisibility')).toBe('hidden');
  });
});
```

**Step 2: Run tests**

```bash
npm run test:functions -- --reporter verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|Error)"
```

Expected: 6 passing for `setGuestListVisibility`.

**Step 3: Commit**

```bash
git add functions/tests/set-guest-list-visibility.test.mjs
git commit -m "test: setGuestListVisibility integration tests (6 cases)"
```

---

### Task 7: `postComment` tests

**Files:**
- Create: `functions/tests/post-comment.test.mjs`

**Step 1: Create the test file**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestore,
  getIdToken,
  callFunction,
  seedReservation,
  db
} from './helpers.mjs';

const RES_ID = 'res-comments';
const HOST_UID = 'host-comments';
const USER_UID = 'commenter-1';

const validPayload = {
  reservationId: RES_ID,
  displayName: 'Ada L.',
  text: 'See you there!'
};

beforeEach(async () => {
  await clearFirestore();
  await seedReservation(RES_ID, { hostUid: HOST_UID });
});

describe('postComment', () => {
  it('requires authentication', async () => {
    await expect(
      callFunction('postComment', validPayload)
    ).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });

  it('throws NOT_FOUND for unknown reservation', async () => {
    const token = await getIdToken(USER_UID);
    await expect(
      callFunction('postComment', { ...validPayload, reservationId: 'no-such-res' }, token)
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
  });

  it('rejects blank text', async () => {
    const token = await getIdToken(USER_UID);
    await expect(
      callFunction('postComment', { ...validPayload, text: '   ' }, token)
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });

  it('creates comment doc with correct fields', async () => {
    const token = await getIdToken(USER_UID);
    const result = await callFunction('postComment', validPayload, token);

    expect(result).toEqual({ ok: true });

    const commentsSnap = await db()
      .collection(`reservations/${RES_ID}/comments`)
      .where('uid', '==', USER_UID)
      .get();

    expect(commentsSnap.size).toBe(1);
    const comment = commentsSnap.docs[0].data();
    expect(comment.uid).toBe(USER_UID);
    expect(comment.displayName).toBe('Ada L.');
    expect(comment.text).toBe('See you there!');
    expect(comment.createdAt).not.toBeNull();
  });

  it('enforces rate limit: 5th succeeds, 6th throws RESOURCE_EXHAUSTED', async () => {
    const token = await getIdToken(USER_UID);

    for (let i = 1; i <= 5; i++) {
      await callFunction('postComment', { ...validPayload, text: `Comment ${i}` }, token);
    }

    await expect(
      callFunction('postComment', { ...validPayload, text: 'Over the limit' }, token)
    ).rejects.toMatchObject({ status: 'RESOURCE_EXHAUSTED' });
  });
});
```

**Step 2: Run tests**

```bash
npm run test:functions -- --reporter verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|Error)"
```

Expected: 5 passing for `postComment`.

**Step 3: Commit**

```bash
git add functions/tests/post-comment.test.mjs
git commit -m "test: postComment integration tests (5 cases)"
```

---

### Task 8: `createTicketPurchase` tests

**Files:**
- Create: `functions/tests/create-ticket-purchase.test.mjs`

**Step 1: Create the test file**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestore,
  getIdToken,
  callFunction,
  seedEvent,
  db
} from './helpers.mjs';

const EVENT_ID = 'event-purchase';
const BUYER_UID = 'buyer-1';

const validPayload = {
  eventId: EVENT_ID,
  displayName: 'Ada Lovelace',
  phone: '+15555551234',
  items: [{ tierId: 'tier-ga', quantity: 2 }]
};

beforeEach(async () => {
  await clearFirestore();
  await seedEvent(EVENT_ID, { published: true, priceCents: 1500, maxPerOrder: 4 });
});

describe('createTicketPurchase', () => {
  it('requires authentication', async () => {
    await expect(
      callFunction('createTicketPurchase', validPayload)
    ).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });

  it('throws NOT_FOUND for unknown event', async () => {
    const token = await getIdToken(BUYER_UID);
    await expect(
      callFunction('createTicketPurchase', { ...validPayload, eventId: 'no-such-event' }, token)
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
  });

  it('rejects unpublished event', async () => {
    await seedEvent(EVENT_ID, { published: false });
    const token = await getIdToken(BUYER_UID);
    await expect(
      callFunction('createTicketPurchase', validPayload, token)
    ).rejects.toMatchObject({ status: 'FAILED_PRECONDITION' });
  });

  it('rejects unknown ticket tier', async () => {
    const token = await getIdToken(BUYER_UID);
    await expect(
      callFunction('createTicketPurchase', {
        ...validPayload,
        items: [{ tierId: 'tier-vip-nonexistent', quantity: 1 }]
      }, token)
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });

  it('rejects empty items array', async () => {
    const token = await getIdToken(BUYER_UID);
    await expect(
      callFunction('createTicketPurchase', { ...validPayload, items: [] }, token)
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });

  it('rejects quantity exceeding maxPerOrder', async () => {
    const token = await getIdToken(BUYER_UID);
    // maxPerOrder is 4, so 5 should fail
    await expect(
      callFunction('createTicketPurchase', {
        ...validPayload,
        items: [{ tierId: 'tier-ga', quantity: 5 }]
      }, token)
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });

  it('creates purchase record and returns purchaseId', async () => {
    const token = await getIdToken(BUYER_UID);
    const result = await callFunction('createTicketPurchase', validPayload, token);

    expect(result.ok).toBe(true);
    expect(typeof result.purchaseId).toBe('string');
    expect(result.purchaseId).toHaveLength(12);

    const purchaseSnap = await db().doc(`ticketPurchases/${result.purchaseId}`).get();
    expect(purchaseSnap.exists).toBe(true);
    expect(purchaseSnap.get('uid')).toBe(BUYER_UID);
    expect(purchaseSnap.get('eventId')).toBe(EVENT_ID);
    expect(purchaseSnap.get('subtotalCents')).toBe(3000); // 2 × 1500
    expect(purchaseSnap.get('status')).toBe('completed');
    expect(purchaseSnap.get('items')[0]).toMatchObject({
      tierId: 'tier-ga',
      tierLabel: 'General Admission',
      priceCents: 1500,
      quantity: 2
    });
  });
});
```

**Step 2: Run all tests**

```bash
npm run test:functions
```

Expected: 29 tests passing across all 5 files.

**Step 3: Commit**

```bash
git add functions/tests/create-ticket-purchase.test.mjs
git commit -m "test: createTicketPurchase integration tests (7 cases)"
```

---

## Running the full suite

```bash
npm run test:functions
```

Emulators auto-start, all 29 tests run, emulators shut down. To run against already-running emulators (faster iteration):

```bash
npm run firebase:emulators   # terminal 1
npm run test:functions       # terminal 2 — skips emulator startup
```
