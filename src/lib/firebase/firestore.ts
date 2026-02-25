import { browser } from '$app/environment';
import { customAlphabet } from 'nanoid';
import {
	collection,
	documentId,
	doc,
	getDoc,
	getDocs,
	limit,
	onSnapshot,
	orderBy,
	query,
	runTransaction,
	serverTimestamp,
	Timestamp,
	where,
	type Unsubscribe,
	updateDoc,
	writeBatch
} from 'firebase/firestore';
import type {
	CreateReservationInput,
	DebugReservationRecord,
	GuestRecord,
	HostReservationListItem,
	PublicAttendeeRecord,
	ReservationPublicRecord,
	ReservationRecord,
	RsvpInput,
	UserActiveTicketRecord
} from '$lib/types/models';
import { formatPublicGuestName } from '$lib/utils/format';
import { generateDebugToken, sha256 } from '$lib/utils/security';
import { db } from './client';

const createReservationId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const RSVP_CAPACITY_FULL_ERROR = 'RSVP_CAPACITY_FULL';

const reservationPublicCollection = collection(db, 'reservationPublic');
const reservationDebugCollection = collection(db, 'reservationDebug');

function coerceTimestamp(value: unknown): Timestamp | null {
	if (value instanceof Timestamp) {
		return value;
	}

	if (
		value &&
		typeof value === 'object' &&
		typeof (value as { toDate?: unknown }).toDate === 'function' &&
		typeof (value as { toMillis?: unknown }).toMillis === 'function'
	) {
		return value as Timestamp;
	}

	if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
		const parsedDate = new Date(value);
		if (!Number.isNaN(parsedDate.getTime())) {
			return Timestamp.fromDate(parsedDate);
		}
	}

	return null;
}

function coerceString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function coerceNumber(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function reservationDocRef(reservationId: string) {
	return doc(db, 'reservations', reservationId);
}

export function reservationPublicDocRef(reservationId: string) {
	return doc(reservationPublicCollection, reservationId);
}

export function reservationPublicAttendeeDocRef(reservationId: string, uid: string) {
	return doc(db, 'reservationPublic', reservationId, 'attendees', uid);
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

export function reservationPublicAttendeesCollectionRef(reservationId: string) {
	return collection(db, 'reservationPublic', reservationId, 'attendees');
}

function normalizeReservationPublicRecord(data: ReservationPublicRecord): ReservationPublicRecord {
	return {
		...data,
		guestListVisibility: data.guestListVisibility === 'visible' ? 'visible' : 'hidden'
	};
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
		guestListVisibility: 'hidden',
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

	return normalizeReservationPublicRecord(snapshot.data() as ReservationPublicRecord);
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
	if (!reservationId || !uid) {
		return false;
	}

	try {
		const hostReservationQuery = query(
			collection(db, 'reservations'),
			where('hostUid', '==', uid),
			where(documentId(), '==', reservationId),
			limit(1)
		);
		const snapshot = await getDocs(hostReservationQuery);
		return !snapshot.empty;
	} catch {
		return false;
	}
}

export function listenToReservationPublic(
	reservationId: string,
	handler: (value: ReservationPublicRecord | null) => void
): Unsubscribe {
	return onSnapshot(reservationPublicDocRef(reservationId), (snapshot) => {
		handler(
			snapshot.exists()
				? normalizeReservationPublicRecord(snapshot.data() as ReservationPublicRecord)
				: null
		);
	});
}

export function listenToPublicAttendees(
	reservationId: string,
	handler: (value: Array<PublicAttendeeRecord & { uid: string }>) => void
): Unsubscribe {
	const attendeesQuery = query(
		reservationPublicAttendeesCollectionRef(reservationId),
		orderBy('updatedAt', 'desc')
	);

	return onSnapshot(attendeesQuery, (snapshot) => {
		handler(
			snapshot.docs.map((document) => ({
				...(document.data() as PublicAttendeeRecord),
				uid: document.id
			}))
		);
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

export async function listUserActiveTickets(uid: string): Promise<UserActiveTicketRecord[]> {
	if (!uid) {
		return [];
	}

	const upcomingQuery = query(
		reservationPublicCollection,
		where('startAt', '>=', Timestamp.now()),
		orderBy('startAt', 'asc'),
		limit(80)
	);
	const upcomingSnapshot = await getDocs(upcomingQuery);

	const mapped = await Promise.all(
		upcomingSnapshot.docs.map(async (document) => {
			const reservationId = document.id;
			const guestSnapshot = await getDoc(guestDocRef(reservationId, uid));
			if (!guestSnapshot.exists()) {
				return null;
			}

			const guest = guestSnapshot.data() as GuestRecord;
			if (guest.status !== 'accepted') {
				return null;
			}

			const reservation = normalizeReservationPublicRecord(document.data() as ReservationPublicRecord);
			const ticket: UserActiveTicketRecord = {
				reservationId,
				clubName: reservation.clubName,
				startAt: reservation.startAt,
				tableType: reservation.tableType,
				capacity: reservation.capacity,
				notes: reservation.notes,
				guestStatus: 'accepted' as const,
				guestDisplayName: guest.displayName,
				plusOneCount: guest.plusOnes?.length ?? 0
			};

			if (reservation.dressCode) {
				ticket.dressCode = reservation.dressCode;
			}

			return ticket;
		})
	);

	return mapped.filter((value): value is UserActiveTicketRecord => value !== null);
}

export async function listHostReservations(uid: string): Promise<HostReservationListItem[]> {
	if (!uid) {
		return [];
	}

	const hostReservationsQuery = query(collection(db, 'reservations'), where('hostUid', '==', uid));
	const hostSnapshot = await getDocs(hostReservationsQuery);

	const mapped = await Promise.all(
		hostSnapshot.docs.map(async (document) => {
			const reservation = document.data() as Partial<ReservationRecord>;
			const reservationId = document.id;
			const startAt = coerceTimestamp(reservation.startAt);
			if (!startAt) {
				return null;
			}

			const publicSnapshot = await getDoc(reservationPublicDocRef(reservationId));
			const publicData = publicSnapshot.exists()
				? normalizeReservationPublicRecord(publicSnapshot.data() as ReservationPublicRecord)
				: null;

			const item: HostReservationListItem = {
				reservationId,
				clubName: coerceString(reservation.clubName, 'Untitled event'),
				startAt,
				tableType: coerceString(reservation.tableType, 'Table'),
				capacity: Math.max(0, coerceNumber(reservation.capacity, 0)),
				notes: coerceString(reservation.notes, ''),
				acceptedCount: Math.max(0, coerceNumber(publicData?.acceptedCount, 0)),
				declinedCount: Math.max(0, coerceNumber(publicData?.declinedCount, 0)),
				updatedAt: publicData?.updatedAt
			};

			const dressCode = coerceString(reservation.dressCode);
			if (dressCode) {
				item.dressCode = dressCode;
			}

			return item;
		})
	);

	return mapped
		.filter((item): item is HostReservationListItem => item !== null)
		.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
}

export async function upsertGuestRsvp(
	reservationId: string,
	uid: string,
	payload: RsvpInput & { phone: string }
): Promise<void> {
	const publicRef = reservationPublicDocRef(reservationId);
	const attendeeRef = reservationPublicAttendeeDocRef(reservationId, uid);
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
		const isNewAcceptance = previousStatus !== 'accepted' && payload.status === 'accepted';

		if (isNewAcceptance && (publicData.acceptedCount ?? 0) >= publicData.capacity) {
			throw new Error(RSVP_CAPACITY_FULL_ERROR);
		}

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
		transaction.set(attendeeRef, {
			namePublic: formatPublicGuestName(payload.displayName),
			status: payload.status,
			updatedAt: serverTimestamp()
		});

		transaction.update(publicRef, {
			acceptedCount,
			declinedCount,
			updatedAt: serverTimestamp()
		});
	});
}

export function isRsvpCapacityFullError(error: unknown): boolean {
	return error instanceof Error && error.message.includes(RSVP_CAPACITY_FULL_ERROR);
}

export async function setGuestListVisibility(
	reservationId: string,
	visibility: 'hidden' | 'visible'
): Promise<void> {
	await updateDoc(reservationPublicDocRef(reservationId), {
		guestListVisibility: visibility,
		updatedAt: serverTimestamp()
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
