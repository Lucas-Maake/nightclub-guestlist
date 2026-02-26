export type AuthIssue =
	| 'invalid-app-credential'
	| 'captcha-check-failed'
	| 'invalid-phone-number'
	| 'too-many-requests'
	| 'billing-not-enabled'
	| null;

function messageFromError(error: unknown): string {
	if (!(error instanceof Error)) {
		return '';
	}

	return error.message;
}

export function detectAuthIssue(error: unknown): AuthIssue {
	const message = messageFromError(error);
	if (!message) {
		return null;
	}

	if (message.includes('auth/too-many-requests')) {
		return 'too-many-requests';
	}

	if (message.includes('auth/invalid-app-credential')) {
		return 'invalid-app-credential';
	}

	if (message.includes('auth/captcha-check-failed')) {
		return 'captcha-check-failed';
	}

	if (message.includes('auth/invalid-phone-number')) {
		return 'invalid-phone-number';
	}

	if (message.includes('auth/billing-not-enabled')) {
		return 'billing-not-enabled';
	}

	return null;
}

export function toUserSafeAuthMessage(error: unknown, productionLike: boolean): string {
	void error;
	const issue = detectAuthIssue(error);

	if (issue === 'too-many-requests') {
		return 'Too many attempts were detected. Please wait 30-60 minutes and try again.';
	}

	if (issue === 'invalid-phone-number') {
		return productionLike
			? 'Enter a valid phone number and try again.'
			: 'That phone number looks incorrect. Please check it and try again.';
	}

	if (issue === 'invalid-app-credential' || issue === 'captcha-check-failed') {
		return productionLike
			? 'Verification expired. Please complete the security check and try again.'
			: 'The security check expired. Please complete it again and retry.';
	}

	if (issue === 'billing-not-enabled') {
		return productionLike
			? 'Phone verification is temporarily unavailable. Please try again later.'
			: 'Phone verification is unavailable in this environment right now.';
	}

	return productionLike
		? 'We could not complete phone verification. Please try again.'
		: 'We could not verify this phone number right now. Please try again.';
}

export function toUserSafeCreateMessage(error: unknown, productionLike: boolean): string {
	const message = messageFromError(error).toLowerCase();
	if (message.includes('timed out') || message.includes('deadline')) {
		return 'This request timed out. Please try again.';
	}

	if (
		message.includes('firestore.googleapis.com') ||
		message.includes('cloud firestore api has not been used') ||
		message.includes('service_disabled')
	) {
		return productionLike
			? 'This service is still being set up. Please try again shortly.'
			: 'This environment is still being set up. Please try again shortly.';
	}

	if (message.includes('permission-denied') || message.includes('missing or insufficient permissions')) {
		return 'You do not have access to create this reservation right now.';
	}

	if (
		message.includes('network') ||
		message.includes('failed to fetch') ||
		message.includes('unavailable') ||
		message.includes('offline')
	) {
		return 'Network connection issue. Please try again.';
	}

	return 'We could not create the reservation right now. Please try again.';
}

export function toUserSafeRsvpMessage(error: unknown, productionLike: boolean): string {
	void productionLike;
	const message = messageFromError(error);
	if (!message) {
		return 'We could not save your RSVP. Please try again.';
	}

	if (message.includes('RSVP_CAPACITY_FULL')) {
		return 'This guest list is currently full. You can still choose "Can\'t make it".';
	}

	if (message.toLowerCase().includes('reservation was not found')) {
		return 'This reservation is no longer available.';
	}

	const lower = message.toLowerCase();
	if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
		return 'We could not save your RSVP right now. Please sign in again and try.';
	}

	if (
		lower.includes('timed out') ||
		lower.includes('deadline') ||
		lower.includes('network') ||
		lower.includes('failed to fetch') ||
		lower.includes('unavailable')
	) {
		return 'Network connection issue. Please try again.';
	}

	return 'We could not save your RSVP right now. Please try again.';
}
