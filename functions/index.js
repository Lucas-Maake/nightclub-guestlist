const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();
const db = getFirestore();
const RSVP_CAPACITY_FULL_ERROR = 'RSVP_CAPACITY_FULL';

function requireAuth(request) {
	if (!request.auth?.uid) {
		throw new HttpsError('unauthenticated', 'Authentication is required.');
	}

	return request.auth.uid;
}

function toNonEmptyString(value, fieldName, maxLength) {
	if (typeof value !== 'string') {
		throw new HttpsError('invalid-argument', `${fieldName} must be a string.`);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		throw new HttpsError('invalid-argument', `${fieldName} is required.`);
	}
	if (trimmed.length > maxLength) {
		throw new HttpsError('invalid-argument', `${fieldName} is too long.`);
	}

	return trimmed;
}

function toOptionalString(value, fieldName, maxLength) {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value !== 'string') {
		throw new HttpsError('invalid-argument', `${fieldName} must be a string.`);
	}
	const trimmed = value.trim();
	if (trimmed.length > maxLength) {
		throw new HttpsError('invalid-argument', `${fieldName} is too long.`);
	}
	return trimmed;
}

function toStatus(value) {
	if (value !== 'accepted' && value !== 'declined') {
		throw new HttpsError('invalid-argument', 'Status must be accepted or declined.');
	}

	return value;
}

function toPlusOnes(value) {
	if (!Array.isArray(value)) {
		throw new HttpsError('invalid-argument', 'plusOnes must be an array.');
	}
	if (value.length > 4) {
		throw new HttpsError('invalid-argument', 'Maximum of 4 plus-ones in MVP.');
	}

	return value.map((entry, index) => {
		if (!entry || typeof entry !== 'object') {
			throw new HttpsError('invalid-argument', `plusOnes[${index}] must be an object.`);
		}

		const name = toNonEmptyString(entry.name, `plusOnes[${index}].name`, 60);
		return { name };
	});
}

function formatPublicGuestName(name) {
	if (!name) {
		return 'Guest';
	}

	const segments = String(name)
		.trim()
		.split(/\s+/)
		.map((value) => value.trim())
		.filter(Boolean);

	if (segments.length === 0) {
		return 'Guest';
	}

	const first = `${segments[0][0].toUpperCase()}${segments[0].slice(1).toLowerCase()}`;
	if (segments.length === 1) {
		return first;
	}

	const secondInitial = segments[1][0]?.toUpperCase() ?? '';
	return secondInitial ? `${first} ${secondInitial}.` : first;
}

async function assertHostReservationAccess(reservationId, uid) {
	const reservationRef = db.collection('reservations').doc(reservationId);
	const snapshot = await reservationRef.get();
	if (!snapshot.exists) {
		throw new HttpsError('not-found', 'Reservation was not found.');
	}

	const hostUid = snapshot.get('hostUid');
	if (hostUid !== uid) {
		throw new HttpsError('permission-denied', 'Host access is required.');
	}

	return reservationRef;
}

exports.upsertGuestRsvp = onCall(async (request) => {
	const uid = requireAuth(request);
	const reservationId = toNonEmptyString(request.data?.reservationId, 'reservationId', 120);
	const status = toStatus(request.data?.status);
	const displayName = toNonEmptyString(request.data?.displayName, 'displayName', 80);
	const phone = toOptionalString(request.data?.phone, 'phone', 40);
	const plusOnes = toPlusOnes(request.data?.plusOnes ?? []);

	const publicRef = db.collection('reservationPublic').doc(reservationId);
	const guestRef = db.collection('reservations').doc(reservationId).collection('guests').doc(uid);
	const attendeeRef = publicRef.collection('attendees').doc(uid);

	await db.runTransaction(async (transaction) => {
		const [publicSnapshot, guestSnapshot] = await Promise.all([
			transaction.get(publicRef),
			transaction.get(guestRef)
		]);

		if (!publicSnapshot.exists) {
			throw new HttpsError('not-found', 'Reservation was not found.');
		}

		const publicData = publicSnapshot.data() || {};
		const capacity = Number(publicData.capacity ?? 0);
		const previousStatus = guestSnapshot.exists ? guestSnapshot.get('status') ?? 'invited' : 'invited';
		const acceptedCountRaw = Number(publicData.acceptedCount ?? 0);
		const declinedCountRaw = Number(publicData.declinedCount ?? 0);

		let acceptedCount = Number.isFinite(acceptedCountRaw) ? acceptedCountRaw : 0;
		let declinedCount = Number.isFinite(declinedCountRaw) ? declinedCountRaw : 0;

		const isNewAcceptance = previousStatus !== 'accepted' && status === 'accepted';
		if (isNewAcceptance && acceptedCount >= capacity) {
			throw new HttpsError('failed-precondition', RSVP_CAPACITY_FULL_ERROR);
		}

		if (previousStatus === 'accepted') {
			acceptedCount -= 1;
		}
		if (previousStatus === 'declined') {
			declinedCount -= 1;
		}
		if (status === 'accepted') {
			acceptedCount += 1;
		}
		if (status === 'declined') {
			declinedCount += 1;
		}

		acceptedCount = Math.max(0, acceptedCount);
		declinedCount = Math.max(0, declinedCount);

		const guestPayload = {
			displayName,
			phone,
			status,
			plusOnes,
			updatedAt: FieldValue.serverTimestamp()
		};

		if (!guestSnapshot.exists) {
			guestPayload.checkedInAt = null;
			guestPayload.checkedInBy = null;
		}

		transaction.set(guestRef, guestPayload, { merge: true });
		transaction.set(attendeeRef, {
			namePublic: formatPublicGuestName(displayName),
			status,
			updatedAt: FieldValue.serverTimestamp()
		});
		transaction.update(publicRef, {
			acceptedCount,
			declinedCount,
			updatedAt: FieldValue.serverTimestamp()
		});
	});

	return { ok: true };
});

exports.setGuestListVisibility = onCall(async (request) => {
	const uid = requireAuth(request);
	const reservationId = toNonEmptyString(request.data?.reservationId, 'reservationId', 120);
	const visibility = request.data?.visibility;
	if (visibility !== 'hidden' && visibility !== 'visible') {
		throw new HttpsError('invalid-argument', 'visibility must be hidden or visible.');
	}

	await assertHostReservationAccess(reservationId, uid);
	await db
		.collection('reservationPublic')
		.doc(reservationId)
		.update({
			guestListVisibility: visibility,
			updatedAt: FieldValue.serverTimestamp()
		});

	return { ok: true };
});

exports.toggleGuestCheckIn = onCall(async (request) => {
	const uid = requireAuth(request);
	const reservationId = toNonEmptyString(request.data?.reservationId, 'reservationId', 120);
	const targetUid = toNonEmptyString(request.data?.uid, 'uid', 120);
	const checkedIn = Boolean(request.data?.checkedIn);

	await assertHostReservationAccess(reservationId, uid);
	await db
		.collection('reservations')
		.doc(reservationId)
		.collection('guests')
		.doc(targetUid)
		.update({
			checkedInAt: checkedIn ? FieldValue.serverTimestamp() : null,
			checkedInBy: checkedIn ? uid : null,
			updatedAt: FieldValue.serverTimestamp()
		});

	return { ok: true };
});

const COMMENT_RATE_LIMIT = 5; // max comments per user per reservation per hour
const COMMENT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

exports.postComment = onCall(async (request) => {
	const uid = requireAuth(request);
	const reservationId = toNonEmptyString(request.data?.reservationId, 'reservationId', 120);
	const displayName = toNonEmptyString(request.data?.displayName, 'displayName', 48);
	const text = toNonEmptyString(request.data?.text, 'text', 280);

	// Verify reservation exists
	const publicRef = db.collection('reservationPublic').doc(reservationId);
	const publicSnapshot = await publicRef.get();
	if (!publicSnapshot.exists) {
		throw new HttpsError('not-found', 'Reservation was not found.');
	}

	// Rate limit: check recent comments by this user on this reservation
	// Simple query by uid only (no composite index needed), filter by time in memory
	const commentsRef = db
		.collection('reservations')
		.doc(reservationId)
		.collection('comments');

	const oneHourAgo = Date.now() - COMMENT_RATE_WINDOW_MS;
	const userCommentsQuery = commentsRef.where('uid', '==', uid);
	const userComments = await userCommentsQuery.get();

	const recentCount = userComments.docs.filter((doc) => {
		const createdAt = doc.get('createdAt');
		if (!createdAt || !createdAt.toMillis) return false;
		return createdAt.toMillis() >= oneHourAgo;
	}).length;

	if (recentCount >= COMMENT_RATE_LIMIT) {
		throw new HttpsError(
			'resource-exhausted',
			'COMMENT_RATE_LIMITED'
		);
	}

	// Create the comment
	await commentsRef.add({
		uid,
		displayName,
		text,
		createdAt: FieldValue.serverTimestamp()
	});

	return { ok: true };
});

// Ticket Purchase
function generatePurchaseId() {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
	let result = '';
	for (let i = 0; i < 12; i++) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}

exports.createTicketPurchase = onCall(async (request) => {
	const uid = requireAuth(request);
	const eventId = toNonEmptyString(request.data?.eventId, 'eventId', 120);
	const displayName = toNonEmptyString(request.data?.displayName, 'displayName', 80);
	const phone = toOptionalString(request.data?.phone, 'phone', 40);
	const items = request.data?.items;

	// Validate items array
	if (!Array.isArray(items) || items.length === 0) {
		throw new HttpsError('invalid-argument', 'At least one ticket item is required.');
	}
	if (items.length > 10) {
		throw new HttpsError('invalid-argument', 'Too many ticket types in one order.');
	}

	// Validate each item
	const validatedItems = items.map((item, index) => {
		if (!item || typeof item !== 'object') {
			throw new HttpsError('invalid-argument', `items[${index}] must be an object.`);
		}
		const tierId = toNonEmptyString(item.tierId, `items[${index}].tierId`, 60);
		const quantity = Number(item.quantity);
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
			throw new HttpsError('invalid-argument', `items[${index}].quantity must be 1-10.`);
		}
		return { tierId, quantity };
	});

	// Fetch event data from Firestore
	const eventRef = db.collection('events').doc(eventId);
	const eventSnapshot = await eventRef.get();

	if (!eventSnapshot.exists) {
		throw new HttpsError('not-found', 'Event was not found.');
	}

	const eventData = eventSnapshot.data();
	if (eventData.published !== true) {
		throw new HttpsError('failed-precondition', 'Event is not available for purchase.');
	}

	// Fetch ticket tiers
	const tiersSnapshot = await eventRef.collection('ticketTiers').get();
	const tierMap = new Map();
	tiersSnapshot.docs.forEach((doc) => {
		tierMap.set(doc.id, { id: doc.id, ...doc.data() });
	});

	// Build purchase items with prices from server
	let subtotalCents = 0;
	const purchaseItems = validatedItems.map((item) => {
		const tier = tierMap.get(item.tierId);
		if (!tier) {
			throw new HttpsError('invalid-argument', `Ticket tier ${item.tierId} not found.`);
		}
		if (item.quantity > (tier.maxPerOrder || 4)) {
			throw new HttpsError('invalid-argument', `Exceeds max quantity for ${tier.label}.`);
		}
		const lineTotalCents = tier.priceCents * item.quantity;
		subtotalCents += lineTotalCents;
		return {
			tierId: item.tierId,
			tierLabel: tier.label,
			priceCents: tier.priceCents,
			quantity: item.quantity
		};
	});

	// Generate purchase ID
	const purchaseId = generatePurchaseId();

	// Create purchase record
	await db.collection('ticketPurchases').doc(purchaseId).set({
		purchaseId,
		eventId,
		eventTitle: eventData.title || 'Event',
		eventVenue: eventData.venue || '',
		eventStartAt: eventData.startAt,
		uid,
		displayName,
		phone: phone || '',
		items: purchaseItems,
		subtotalCents,
		status: 'completed',
		createdAt: FieldValue.serverTimestamp()
	});

	return { ok: true, purchaseId };
});
