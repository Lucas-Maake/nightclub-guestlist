import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rsvpSchema, plusOneSchema, createReservationSchema } from './reservation';

describe('plusOneSchema', () => {
	it('validates valid plus-one name', () => {
		const result = plusOneSchema.safeParse({ name: 'John Doe' });
		expect(result.success).toBe(true);
	});

	it('rejects empty name', () => {
		const result = plusOneSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});

	it('rejects name over 60 characters', () => {
		const result = plusOneSchema.safeParse({ name: 'a'.repeat(61) });
		expect(result.success).toBe(false);
	});

	it('trims whitespace', () => {
		const result = plusOneSchema.safeParse({ name: '  John Doe  ' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('John Doe');
		}
	});
});

describe('rsvpSchema', () => {
	it('validates accepted RSVP', () => {
		const result = rsvpSchema.safeParse({
			status: 'accepted',
			displayName: 'John Doe',
			plusOnes: []
		});
		expect(result.success).toBe(true);
	});

	it('validates declined RSVP', () => {
		const result = rsvpSchema.safeParse({
			status: 'declined',
			displayName: 'John Doe',
			plusOnes: []
		});
		expect(result.success).toBe(true);
	});

	it('validates RSVP with plus-ones', () => {
		const result = rsvpSchema.safeParse({
			status: 'accepted',
			displayName: 'John Doe',
			plusOnes: [{ name: 'Jane Doe' }, { name: 'Bob Smith' }]
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid status', () => {
		const result = rsvpSchema.safeParse({
			status: 'maybe',
			displayName: 'John Doe',
			plusOnes: []
		});
		expect(result.success).toBe(false);
	});

	it('rejects short display name', () => {
		const result = rsvpSchema.safeParse({
			status: 'accepted',
			displayName: 'J',
			plusOnes: []
		});
		expect(result.success).toBe(false);
	});

	it('rejects more than 4 plus-ones', () => {
		const result = rsvpSchema.safeParse({
			status: 'accepted',
			displayName: 'John Doe',
			plusOnes: [
				{ name: 'One' },
				{ name: 'Two' },
				{ name: 'Three' },
				{ name: 'Four' },
				{ name: 'Five' }
			]
		});
		expect(result.success).toBe(false);
	});
});

describe('createReservationSchema', () => {
	beforeEach(() => {
		// Mock Date.now to a fixed value for testing future dates
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('validates a valid reservation', () => {
		const result = createReservationSchema.safeParse({
			clubName: 'Club Neon',
			startAt: '2025-01-20T22:00:00',
			tableType: 'VIP Table',
			capacity: 10,
			notes: 'Birthday party celebration',
			dressCode: 'Cocktail attire',
			debugEnabled: false
		});
		expect(result.success).toBe(true);
	});

	it('rejects past start date', () => {
		const result = createReservationSchema.safeParse({
			clubName: 'Club Neon',
			startAt: '2024-01-01T22:00:00', // Past date
			tableType: 'VIP Table',
			capacity: 10,
			notes: 'Birthday party celebration',
			debugEnabled: false
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid date format', () => {
		const result = createReservationSchema.safeParse({
			clubName: 'Club Neon',
			startAt: 'not-a-date',
			tableType: 'VIP Table',
			capacity: 10,
			notes: 'Birthday party celebration',
			debugEnabled: false
		});
		expect(result.success).toBe(false);
	});

	it('rejects capacity below 1', () => {
		const result = createReservationSchema.safeParse({
			clubName: 'Club Neon',
			startAt: '2025-01-20T22:00:00',
			tableType: 'VIP Table',
			capacity: 0,
			notes: 'Birthday party celebration',
			debugEnabled: false
		});
		expect(result.success).toBe(false);
	});

	it('rejects capacity above 100', () => {
		const result = createReservationSchema.safeParse({
			clubName: 'Club Neon',
			startAt: '2025-01-20T22:00:00',
			tableType: 'VIP Table',
			capacity: 101,
			notes: 'Birthday party celebration',
			debugEnabled: false
		});
		expect(result.success).toBe(false);
	});

	it('transforms empty dressCode to undefined', () => {
		const result = createReservationSchema.safeParse({
			clubName: 'Club Neon',
			startAt: '2025-01-20T22:00:00',
			tableType: 'VIP Table',
			capacity: 10,
			notes: 'Birthday party celebration',
			dressCode: '',
			debugEnabled: false
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dressCode).toBeUndefined();
		}
	});
});
