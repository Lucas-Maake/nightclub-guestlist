import type { Timestamp } from 'firebase/firestore';

export type GuestStatus = 'invited' | 'accepted' | 'declined';

export interface PlusOne {
	name: string;
}

export interface ReservationRecord {
	clubName: string;
	startAt: Timestamp;
	tableType: string;
	capacity: number;
	notes: string;
	dressCode?: string;
	hostUid: string;
	createdAt: Timestamp;
	debugEnabled: boolean;
	debugTokenHash?: string;
}

export interface ReservationPublicRecord {
	reservationId: string;
	clubName: string;
	startAt: Timestamp;
	tableType: string;
	capacity: number;
	notes: string;
	dressCode?: string;
	debugEnabled: boolean;
	acceptedCount: number;
	declinedCount: number;
	updatedAt: Timestamp;
}

export interface DebugReservationRecord {
	reservationId: string;
	hostUid: string;
	debugTokenHash: string;
	createdAt: Timestamp;
}

export interface GuestRecord {
	displayName: string;
	phone: string;
	status: GuestStatus;
	plusOnes: PlusOne[];
	checkedInAt: Timestamp | null;
	checkedInBy: string | null;
	updatedAt: Timestamp;
}

export interface UserRecord {
	phone: string | null;
	createdAt: Timestamp;
	lastSeenAt: Timestamp;
	displayName?: string;
}

export interface CreateReservationInput {
	clubName: string;
	startAt: string;
	tableType: string;
	capacity: number;
	notes: string;
	dressCode?: string;
	debugEnabled: boolean;
}

export interface RsvpInput {
	status: Extract<GuestStatus, 'accepted' | 'declined'>;
	plusOnes: PlusOne[];
	displayName: string;
}
