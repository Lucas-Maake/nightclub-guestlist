import { describe, expect, it } from 'vitest';
import { toUserSafePurchaseMessage, toUserSafeRsvpMessage } from './messages';

describe('toUserSafePurchaseMessage', () => {
	it('maps missing ticket selection error', () => {
		expect(
			toUserSafePurchaseMessage(new Error('invalid-argument: At least one ticket item is required.'))
		).toBe('Select at least one ticket before checkout.');
	});

	it('maps event unavailable errors', () => {
		expect(
			toUserSafePurchaseMessage(
				new Error('failed-precondition: Event is not available for purchase.')
			)
		).toBe('This event is no longer available for ticket purchases.');
	});

	it('maps per-tier max quantity errors', () => {
		expect(toUserSafePurchaseMessage(new Error('invalid-argument: Exceeds max quantity for VIP.'))).toBe(
			'Selected quantity exceeds the ticket limit for this tier.'
		);
	});

	it('maps unauthenticated errors', () => {
		expect(toUserSafePurchaseMessage(new Error('unauthenticated'))).toBe(
			'Sign in is required to complete your purchase.'
		);
	});

	it('maps network-like errors', () => {
		expect(toUserSafePurchaseMessage(new Error('Failed to fetch'))).toBe(
			'Network connection issue. Please try again.'
		);
	});

	it('falls back to generic error', () => {
		expect(toUserSafePurchaseMessage(new Error('something unexpected'))).toBe(
			'Purchase could not be completed. Please try again.'
		);
	});
});

describe('toUserSafeRsvpMessage', () => {
	it('maps RSVP_CAPACITY_FULL to a specific message', () => {
		expect(toUserSafeRsvpMessage(new Error('RSVP_CAPACITY_FULL'), true)).toBe(
			'This guest list is currently full. You can still choose "Can\'t make it".'
		);
	});

	it('maps reservation not found errors', () => {
		expect(toUserSafeRsvpMessage(new Error('Reservation was not found.'), false)).toBe(
			'This reservation is no longer available.'
		);
	});
});
