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
