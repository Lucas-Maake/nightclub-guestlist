import { browser } from '$app/environment';
import { customAlphabet } from 'nanoid';
import {
	addDoc,
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
	setDoc,
	serverTimestamp,
	Timestamp,
	where,
	type Unsubscribe,
	writeBatch
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { EventCatalogItem, EventTicketTier } from '$lib/data/events';
import { findEventById, listEventsSortedAsc } from '$lib/data/events';
import type {
	CreateReservationInput,
	DebugReservationRecord,
	GuestRecord,
	HostReservationListItem,
	PublicAttendeeRecord,
	ReservationCommentRecord,
	ReservationPublicRecord,
	ReservationRecord,
	RsvpInput,
	UserActiveTicketRecord,
	WaitlistRequestRecord
} from '$lib/types/models';
import { generateDebugToken, sha256 } from '$lib/utils/security';
import { db, functions } from './client';

const createReservationId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const RSVP_CAPACITY_FULL_ERROR = 'RSVP_CAPACITY_FULL';

const reservationPublicCollection = collection(db, 'reservationPublic');
const reservationDebugCollection = collection(db, 'reservationDebug');
const eventsCollection = collection(db, 'events');

const upsertGuestRsvpCallable = httpsCallable<
	{
		reservationId: string;
		status: Extract<GuestRecord['status'], 'accepted' | 'declined'>;
		plusOnes: Array<{ name: string }>;
		displayName: string;
		phone: string;
	},
	{ ok: true }
>(functions, 'upsertGuestRsvp');

const setGuestListVisibilityCallable = httpsCallable<
	{
		reservationId: string;
		visibility: 'hidden' | 'visible';
	},
	{ ok: true }
>(functions, 'setGuestListVisibility');

const toggleGuestCheckInCallable = httpsCallable<
	{
		reservationId: string;
		uid: string;
		checkedIn: boolean;
	},
	{ ok: true }
>(functions, 'toggleGuestCheckIn');

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

function coerceEventTicketTier(value: unknown): (EventTicketTier & { sortOrder: number }) | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const source = value as Record<string, unknown>;
	const label = coerceString(source.label);
	const priceCents = Math.max(0, coerceNumber(source.priceCents, 0));
	const maxPerOrder = Math.max(0, coerceNumber(source.maxPerOrder, 0));
	const sortOrder = coerceNumber(source.sortOrder, 0);

	if (!label) {
		return null;
	}

	return {
		id: '',
		label,
		priceCents,
		maxPerOrder,
		sortOrder
	};
}

function mapEventFromDoc(
	eventId: string,
	value: unknown,
	ticketTiers: EventTicketTier[]
): EventCatalogItem | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const source = value as Record<string, unknown>;
	const startAt = coerceTimestamp(source.startAt);
	const endAt = coerceTimestamp(source.endAt);
	if (!startAt || !endAt) {
		return null;
	}

	const title = coerceString(source.title);
	const venue = coerceString(source.venue);
	if (!title || !venue) {
		return null;
	}
	const posterImageUrl = coerceString(source.posterImageUrl).trim();

	return {
		id: eventId,
		title,
		venue,
		location: coerceString(source.location),
		addressLine: coerceString(source.addressLine),
		startAt: startAt.toDate().toISOString(),
		endAt: endAt.toDate().toISOString(),
		posterHeadline: coerceString(source.posterHeadline, title),
		posterClass: coerceString(
			source.posterClass,
			'bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.25),transparent_36%),radial-gradient(circle_at_82%_10%,rgba(16,185,129,0.25),transparent_42%),linear-gradient(180deg,#0f172a_0%,#0b1220_56%,#05070c_100%)]'
		),
		...(posterImageUrl ? { posterImageUrl } : {}),
		description: coerceString(source.description),
		ticketTiers,
		defaultTableType: coerceString(source.defaultTableType, 'Main Floor Table'),
		dressCode: coerceString(source.dressCode, 'Nightlife attire')
	};
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

export function waitlistDocRef(reservationId: string, uid: string) {
	return doc(db, 'reservations', reservationId, 'waitlist', uid);
}

export function reservationCommentsCollectionRef(reservationId: string) {
	return collection(db, 'reservations', reservationId, 'comments');
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

export function listenToWaitlistRequest(
	reservationId: string,
	uid: string,
	handler: (value: WaitlistRequestRecord | null) => void
): Unsubscribe {
	return onSnapshot(waitlistDocRef(reservationId, uid), (snapshot) => {
		handler(snapshot.exists() ? (snapshot.data() as WaitlistRequestRecord) : null);
	});
}

export function listenToReservationComments(
	reservationId: string,
	handler: (value: Array<ReservationCommentRecord & { id: string }>) => void
): Unsubscribe {
	const commentsQuery = query(
		reservationCommentsCollectionRef(reservationId),
		orderBy('createdAt', 'desc'),
		limit(25)
	);
	return onSnapshot(
		commentsQuery,
		(snapshot) => {
			handler(
				snapshot.docs
					.map((document) => {
						const source = document.data() as Partial<ReservationCommentRecord>;
						const createdAt = coerceTimestamp(source.createdAt);
						const text = coerceString(source.text).trim();
						if (!createdAt || !text) {
							return null;
						}

						return {
							id: document.id,
							uid: coerceString(source.uid),
							displayName: coerceString(source.displayName, 'Guest'),
							text,
							createdAt
						};
					})
					.filter(
						(comment): comment is ReservationCommentRecord & { id: string } => comment !== null
					)
			);
		},
		() => {
			handler([]);
		}
	);
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

async function loadEventTicketTiers(eventId: string): Promise<EventTicketTier[]> {
	const tiersCollection = collection(db, 'events', eventId, 'ticketTiers');
	const tiersQuery = query(tiersCollection, orderBy('sortOrder', 'asc'));
	const tiersSnapshot = await getDocs(tiersQuery);

	const mapped = tiersSnapshot.docs
		.map((document) => {
			const tier = coerceEventTicketTier(document.data());
			if (!tier) {
				return null;
			}

			return {
				id: document.id,
				label: tier.label,
				priceCents: tier.priceCents,
				maxPerOrder: tier.maxPerOrder,
				sortOrder: tier.sortOrder
			};
		})
		.filter((tier): tier is EventTicketTier & { sortOrder: number } => tier !== null)
		.sort((a, b) => a.sortOrder - b.sortOrder);

	return mapped.map(({ sortOrder: _sortOrder, ...tier }) => tier);
}

export async function listPublishedEvents(): Promise<EventCatalogItem[]> {
	try {
		const eventsQuery = query(
			eventsCollection,
			where('published', '==', true),
			orderBy('startAt', 'asc'),
			limit(80)
		);
		const eventsSnapshot = await getDocs(eventsQuery);

		const mapped = await Promise.all(
			eventsSnapshot.docs.map(async (document) => {
				const eventId = document.id;
				const ticketTiers = await loadEventTicketTiers(eventId);
				return mapEventFromDoc(eventId, document.data(), ticketTiers);
			})
		);

		const normalized = mapped.filter((event): event is EventCatalogItem => event !== null);
		if (normalized.length > 0) {
			return normalized;
		}
	} catch {
		// Fallback to local catalog for environments without seeded events yet.
	}

	return listEventsSortedAsc();
}

export async function getPublishedEventById(eventId: string): Promise<EventCatalogItem | null> {
	if (!eventId) {
		return null;
	}

	try {
		const eventSnapshot = await getDoc(doc(db, 'events', eventId));
		if (eventSnapshot.exists()) {
			const data = eventSnapshot.data() as Record<string, unknown>;
			if (data.published !== true) {
				return null;
			}

			const ticketTiers = await loadEventTicketTiers(eventId);
			return mapEventFromDoc(eventId, data, ticketTiers);
		}
	} catch {
		// Fall through to local fallback.
	}

	return findEventById(eventId);
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
	void uid;
	await upsertGuestRsvpCallable({
		reservationId,
		status: payload.status,
		displayName: payload.displayName,
		plusOnes: payload.plusOnes,
		phone: payload.phone
	});
}

export async function upsertWaitlistRequest(
	reservationId: string,
	uid: string,
	payload: Pick<WaitlistRequestRecord, 'displayName' | 'phone' | 'plusOnes'>
): Promise<void> {
	await setDoc(
		waitlistDocRef(reservationId, uid),
		{
			displayName: payload.displayName,
			phone: payload.phone,
			plusOnes: payload.plusOnes,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function postReservationComment(
	reservationId: string,
	uid: string,
	payload: Pick<ReservationCommentRecord, 'displayName' | 'text'>
): Promise<void> {
	const text = payload.text.trim().slice(0, 280);
	if (!reservationId || !uid || !text) {
		throw new Error('INVALID_RESERVATION_COMMENT');
	}

	await addDoc(reservationCommentsCollectionRef(reservationId), {
		uid,
		displayName: payload.displayName.trim().slice(0, 48) || 'Guest',
		text,
		createdAt: serverTimestamp()
	});
}

export function isRsvpCapacityFullError(error: unknown): boolean {
	return error instanceof Error && error.message.includes(RSVP_CAPACITY_FULL_ERROR);
}

export async function setGuestListVisibility(
	reservationId: string,
	visibility: 'hidden' | 'visible'
): Promise<void> {
	await setGuestListVisibilityCallable({
		reservationId,
		visibility
	});
}

export async function toggleGuestCheckIn(
	reservationId: string,
	uid: string,
	checkedIn: boolean,
	checkedInBy: string
): Promise<void> {
	void checkedInBy;
	await toggleGuestCheckInCallable({
		reservationId,
		uid,
		checkedIn
	});
}
