import { browser } from '$app/environment';
import { customAlphabet } from 'nanoid';
import {
	collection,
	doc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	runTransaction,
	serverTimestamp,
	Timestamp,
	type Unsubscribe,
	updateDoc,
	writeBatch
} from 'firebase/firestore';
import type {
	CreateReservationInput,
	DebugReservationRecord,
	GuestRecord,
	ReservationPublicRecord,
	ReservationRecord,
	RsvpInput
} from '$lib/types/models';
import { generateDebugToken, sha256 } from '$lib/utils/security';
import { db } from './client';

const createReservationId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const reservationPublicCollection = collection(db, 'reservationPublic');
const reservationDebugCollection = collection(db, 'reservationDebug');

export function reservationDocRef(reservationId: string) {
	return doc(db, 'reservations', reservationId);
}

export function reservationPublicDocRef(reservationId: string) {
	return doc(reservationPublicCollection, reservationId);
}

export function reservationDebugDocRef(reservationId: string) {
	return doc(reservationDebugCollection, reservationId);
}

export function guestDocRef(reservationId: string, uid: string) {
	return doc(db, 'reservations', reservationId, 'guests', uid);
}

export function guestsCollectionRef(reservationId: string) {
	return collection(db, 'reservations', reservationId, 'guests');
}

export async function createReservation(
	input: CreateReservationInput,
	hostUid: string
): Promise<{ reservationId: string; debugToken?: string }> {
	const reservationId = createReservationId();
	const startAt = Timestamp.fromDate(new Date(input.startAt));
	let debugToken: string | undefined;
	let debugTokenHash: string | undefined;

	if (input.debugEnabled) {
		debugToken = generateDebugToken();
		debugTokenHash = await sha256(debugToken);
	}

	const reservationRef = reservationDocRef(reservationId);
	const publicRef = reservationPublicDocRef(reservationId);
	const debugRef = reservationDebugDocRef(reservationId);

	const batch = writeBatch(db);

	batch.set(reservationRef, {
		clubName: input.clubName,
		startAt,
		tableType: input.tableType,
		capacity: input.capacity,
		notes: input.notes,
		dressCode: input.dressCode ?? '',
		hostUid,
		createdAt: serverTimestamp(),
		debugEnabled: input.debugEnabled,
		...(debugTokenHash ? { debugTokenHash } : {})
	});

	batch.set(publicRef, {
		reservationId,
		clubName: input.clubName,
		startAt,
		tableType: input.tableType,
		capacity: input.capacity,
		notes: input.notes,
		dressCode: input.dressCode ?? '',
		debugEnabled: input.debugEnabled,
		acceptedCount: 0,
		declinedCount: 0,
		updatedAt: serverTimestamp()
	});

	if (input.debugEnabled && debugTokenHash) {
		batch.set(debugRef, {
			reservationId,
			hostUid,
			debugTokenHash,
			createdAt: serverTimestamp()
		});
	}

	await batch.commit();

	return {
		reservationId,
		debugToken
	};
}

export async function upsertUserRecord(
	uid: string,
	phone: string | null | undefined,
	displayName: string | null
): Promise<void> {
	if (!browser) {
		return;
	}

	const userRef = doc(db, 'users', uid);

	await runTransaction(db, async (transaction) => {
		const snapshot = await transaction.get(userRef);
		const payload: Record<string, unknown> = {
			phone: phone ?? null,
			lastSeenAt: serverTimestamp()
		};

		if (displayName) {
			payload.displayName = displayName;
		}

		if (snapshot.exists()) {
			transaction.update(userRef, payload);
		} else {
			transaction.set(userRef, {
				...payload,
				createdAt: serverTimestamp()
			});
		}
	});
}

export async function getReservationPublic(
	reservationId: string
): Promise<ReservationPublicRecord | null> {
	const snapshot = await getDoc(reservationPublicDocRef(reservationId));
	if (!snapshot.exists()) {
		return null;
	}

	return snapshot.data() as ReservationPublicRecord;
}

export async function getReservationPrivate(
	reservationId: string
): Promise<ReservationRecord | null> {
	const snapshot = await getDoc(reservationDocRef(reservationId));
	if (!snapshot.exists()) {
		return null;
	}

	return snapshot.data() as ReservationRecord;
}

export async function validateDebugToken(reservationId: string, token: string): Promise<boolean> {
	if (!token) {
		return false;
	}

	const snapshot = await getDoc(reservationDebugDocRef(reservationId));
	if (!snapshot.exists()) {
		return false;
	}

	const data = snapshot.data() as DebugReservationRecord;
	const tokenHash = await sha256(token);
	return tokenHash === data.debugTokenHash;
}

export async function isHostForReservation(reservationId: string, uid: string): Promise<boolean> {
	const reservation = await getReservationPrivate(reservationId);
	return reservation?.hostUid === uid;
}

export function listenToReservationPublic(
	reservationId: string,
	handler: (value: ReservationPublicRecord | null) => void
): Unsubscribe {
	return onSnapshot(reservationPublicDocRef(reservationId), (snapshot) => {
		handler(snapshot.exists() ? (snapshot.data() as ReservationPublicRecord) : null);
	});
}

export function listenToReservationPrivate(
	reservationId: string,
	handler: (value: ReservationRecord | null) => void
): Unsubscribe {
	return onSnapshot(reservationDocRef(reservationId), (snapshot) => {
		handler(snapshot.exists() ? (snapshot.data() as ReservationRecord) : null);
	});
}

export function listenToGuest(
	reservationId: string,
	uid: string,
	handler: (value: GuestRecord | null) => void
): Unsubscribe {
	return onSnapshot(guestDocRef(reservationId, uid), (snapshot) => {
		handler(snapshot.exists() ? (snapshot.data() as GuestRecord) : null);
	});
}

export function listenToGuests(
	reservationId: string,
	handler: (value: Array<GuestRecord & { uid: string }>) => void
): Unsubscribe {
	const guestQuery = query(guestsCollectionRef(reservationId), orderBy('updatedAt', 'desc'));
	return onSnapshot(guestQuery, (snapshot) => {
		handler(snapshot.docs.map((document) => ({ ...(document.data() as GuestRecord), uid: document.id })));
	});
}

export async function upsertGuestRsvp(
	reservationId: string,
	uid: string,
	payload: RsvpInput & { phone: string }
): Promise<void> {
	const publicRef = reservationPublicDocRef(reservationId);
	const guestRef = guestDocRef(reservationId, uid);

	await runTransaction(db, async (transaction) => {
		const [publicSnapshot, guestSnapshot] = await Promise.all([
			transaction.get(publicRef),
			transaction.get(guestRef)
		]);

		if (!publicSnapshot.exists()) {
			throw new Error('Reservation was not found.');
		}

		const publicData = publicSnapshot.data() as ReservationPublicRecord;
		const previousStatus = guestSnapshot.exists()
			? ((guestSnapshot.data() as GuestRecord).status ?? 'invited')
			: 'invited';

		let acceptedCount = publicData.acceptedCount ?? 0;
		let declinedCount = publicData.declinedCount ?? 0;

		if (previousStatus === 'accepted') {
			acceptedCount -= 1;
		}
		if (previousStatus === 'declined') {
			declinedCount -= 1;
		}
		if (payload.status === 'accepted') {
			acceptedCount += 1;
		}
		if (payload.status === 'declined') {
			declinedCount += 1;
		}

		acceptedCount = Math.max(0, acceptedCount);
		declinedCount = Math.max(0, declinedCount);

		const guestPayload: Record<string, unknown> = {
			displayName: payload.displayName,
			phone: payload.phone,
			status: payload.status,
			plusOnes: payload.plusOnes,
			updatedAt: serverTimestamp()
		};

		if (!guestSnapshot.exists()) {
			guestPayload.checkedInAt = null;
			guestPayload.checkedInBy = null;
		}

		transaction.set(guestRef, guestPayload, { merge: true });

		transaction.update(publicRef, {
			acceptedCount,
			declinedCount,
			updatedAt: serverTimestamp()
		});
	});
}

export async function toggleGuestCheckIn(
	reservationId: string,
	uid: string,
	checkedIn: boolean,
	checkedInBy: string
): Promise<void> {
	await updateDoc(guestDocRef(reservationId, uid), {
		checkedInAt: checkedIn ? serverTimestamp() : null,
		checkedInBy: checkedIn ? checkedInBy : null,
		updatedAt: serverTimestamp()
	});
}
