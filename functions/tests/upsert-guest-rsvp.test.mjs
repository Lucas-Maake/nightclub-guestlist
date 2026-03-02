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
    ).rejects.toMatchObject({ status: 'FAILED_PRECONDITION', message: expect.stringContaining('RSVP_CAPACITY_FULL') });
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
