import { describe, expect, it, vi } from 'vitest';
import type { Timestamp } from 'firebase/firestore';
import {
	clearPendingGuest,
	createUndoCheckInToast,
	isGuestEligibleForCheckIn,
	resolveGuestCheckInState
} from './checkin';

describe('isGuestEligibleForCheckIn', () => {
	it('returns true only for accepted guests', () => {
		expect(isGuestEligibleForCheckIn('accepted')).toBe(true);
		expect(isGuestEligibleForCheckIn('declined')).toBe(false);
		expect(isGuestEligibleForCheckIn('invited')).toBe(false);
	});
});

describe('resolveGuestCheckInState', () => {
	const checkedInAt = {} as Timestamp;

	it('prefers pending state over persisted state', () => {
		expect(resolveGuestCheckInState('guest-1', null, { 'guest-1': true })).toBe(true);
		expect(resolveGuestCheckInState('guest-1', checkedInAt, { 'guest-1': false })).toBe(false);
	});

	it('falls back to persisted checkedInAt when no pending state exists', () => {
		expect(resolveGuestCheckInState('guest-1', null, {})).toBe(false);
		expect(resolveGuestCheckInState('guest-1', checkedInAt, {})).toBe(true);
	});
});

describe('clearPendingGuest', () => {
	it('removes only the targeted pending guest key', () => {
		const result = clearPendingGuest(
			{
				'guest-1': true,
				'guest-2': false
			},
			'guest-1'
		);

		expect(result).toEqual({ 'guest-2': false });
	});

	it('returns the same object when guest is not pending', () => {
		const pending = { 'guest-1': true };
		expect(clearPendingGuest(pending, 'guest-2')).toBe(pending);
	});
});

describe('createUndoCheckInToast', () => {
	it('creates checked-in success toast with undo action', () => {
		const onUndo = vi.fn();
		const toast = createUndoCheckInToast(true, 'Ada Lovelace', onUndo);

		expect(toast.title).toBe('Checked in');
		expect(toast.description).toBe('Ada Lovelace');
		expect(toast.variant).toBe('success');
		expect(toast.action?.label).toBe('Undo');

		toast.action?.onClick();
		expect(onUndo).toHaveBeenCalledOnce();
	});

	it('falls back to Guest when name is blank', () => {
		const toast = createUndoCheckInToast(false, '  ', () => {});
		expect(toast.title).toBe('Check-in removed');
		expect(toast.description).toBe('Guest');
	});
});
