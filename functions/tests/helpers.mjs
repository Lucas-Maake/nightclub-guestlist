import { initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'nightclub-guestlist';
const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST_ADDR = '127.0.0.1:8080';
const FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001';

// Must be set before initializeApp is called
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST_ADDR;

const FUNCTIONS_BASE = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/us-central1`;
const FIRESTORE_EMULATOR = `http://${FIRESTORE_EMULATOR_HOST_ADDR}`;

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
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`,
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

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`callFunction(${name}) returned non-JSON HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

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
