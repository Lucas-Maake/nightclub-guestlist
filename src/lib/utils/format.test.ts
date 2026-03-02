import { describe, it, expect } from 'vitest';
import { formatPublicGuestName, formatPhone, initialsFromName } from './format';

describe('formatPublicGuestName', () => {
	it('returns "Guest" for null/undefined', () => {
		expect(formatPublicGuestName(null)).toBe('Guest');
		expect(formatPublicGuestName(undefined)).toBe('Guest');
	});

	it('returns "Guest" for empty or whitespace-only strings', () => {
		expect(formatPublicGuestName('')).toBe('Guest');
		expect(formatPublicGuestName('   ')).toBe('Guest');
	});

	it('formats single name with title case', () => {
		expect(formatPublicGuestName('john')).toBe('John');
		expect(formatPublicGuestName('JANE')).toBe('Jane');
	});

	it('formats full name with first name and last initial', () => {
		expect(formatPublicGuestName('john doe')).toBe('John D.');
		expect(formatPublicGuestName('Jane Smith')).toBe('Jane S.');
	});

	it('handles extra whitespace', () => {
		expect(formatPublicGuestName('  john   doe  ')).toBe('John D.');
	});

	it('handles multiple names, using only first two', () => {
		expect(formatPublicGuestName('John Michael Doe')).toBe('John M.');
	});
});

describe('formatPhone', () => {
	it('returns empty string for null/undefined', () => {
		expect(formatPhone(null)).toBe('');
		expect(formatPhone(undefined)).toBe('');
	});

	it('formats 10-digit US phone numbers', () => {
		expect(formatPhone('1234567890')).toBe('(123) 456-7890');
		expect(formatPhone('555-123-4567')).toBe('(555) 123-4567');
	});

	it('returns original for non-10-digit numbers', () => {
		expect(formatPhone('+1 555-123-4567')).toBe('+1 555-123-4567');
		expect(formatPhone('12345')).toBe('12345');
	});
});

describe('initialsFromName', () => {
	it('returns "GU" for null/undefined', () => {
		expect(initialsFromName(null)).toBe('GU');
		expect(initialsFromName(undefined)).toBe('GU');
	});

	it('returns "GU" for empty strings', () => {
		expect(initialsFromName('')).toBe('GU');
		expect(initialsFromName('   ')).toBe('GU');
	});

	it('returns single initial for single name', () => {
		expect(initialsFromName('John')).toBe('J');
	});

	it('returns two initials for full name', () => {
		expect(initialsFromName('John Doe')).toBe('JD');
		expect(initialsFromName('jane smith')).toBe('JS');
	});

	it('handles only first two name parts', () => {
		expect(initialsFromName('John Michael Doe')).toBe('JM');
	});
});
