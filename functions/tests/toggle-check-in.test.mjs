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
