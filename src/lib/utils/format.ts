const dateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
	hour: 'numeric',
	minute: '2-digit'
});

export function formatReservationDate(date: Date): string {
	return `${dateFormatter.format(date)} at ${timeFormatter.format(date)}`;
}

export function formatPhone(phone?: string | null): string {
	if (!phone) {
		return '';
	}

	const digits = phone.replace(/\D/g, '');
	if (digits.length === 10) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}

	return phone;
}

export function initialsFromName(name?: string | null): string {
	if (!name) {
		return 'GU';
	}

	const segments = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2);

	if (segments.length === 0) {
		return 'GU';
	}

	return segments.map((part) => part[0]?.toUpperCase() ?? '').join('');
}
