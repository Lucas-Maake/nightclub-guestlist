import { z } from 'zod';

const now = new Date('2000-01-01T00:00:00.000Z');

export const plusOneSchema = z.object({
	name: z.string().trim().min(1, 'Plus-one name is required.').max(60, 'Name is too long.')
});

export const createReservationSchema = z.object({
	clubName: z.string().trim().min(2, 'Club name is required.').max(100, 'Club name is too long.'),
	startAt: z
		.string()
		.refine((value) => !Number.isNaN(new Date(value).getTime()), 'Valid date and time is required.')
		.refine((value) => new Date(value) > now, 'Start time must be in the future.'),
	tableType: z.string().trim().min(2, 'Table type is required.').max(80, 'Table type is too long.'),
	capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1.').max(100, 'Capacity is too high.'),
	notes: z.string().trim().min(4, 'Notes are required.').max(500, 'Notes are too long.'),
	dressCode: z
		.string()
		.trim()
		.max(120, 'Dress code is too long.')
		.optional()
		.transform((value) => (value ? value : undefined)),
	debugEnabled: z.coerce.boolean()
});

export const rsvpSchema = z.object({
	status: z.enum(['accepted', 'declined']),
	plusOnes: z.array(plusOneSchema).max(4, 'Maximum of 4 plus-ones in MVP.'),
	displayName: z.string().trim().min(2, 'Display name is required.').max(80, 'Name is too long.')
});

export const checkInSchema = z.object({
	checkedIn: z.boolean()
});
