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
