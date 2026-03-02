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
