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
