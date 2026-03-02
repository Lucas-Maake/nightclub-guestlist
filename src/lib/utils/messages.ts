export type AuthIssue =
	| 'invalid-app-credential'
	| 'captcha-check-failed'
	| 'invalid-phone-number'
	| 'invalid-email'
	| 'invalid-credential'
	| 'user-not-found'
	| 'email-already-in-use'
	| 'weak-password'
	| 'network-request-failed'
	| 'too-many-requests'
	| 'billing-not-enabled'
	| null;

function messageFromError(error: unknown): string {
	if (!(error instanceof Error)) {
		return '';
	}

	return error.message;
}

function codeFromError(error: unknown): string {
	if (
		error &&
		typeof error === 'object' &&
		typeof (error as { code?: unknown }).code === 'string'
	) {
		return (error as { code: string }).code;
	}

	const message = messageFromError(error);
	const match = message.match(/auth\/[a-z-]+/);
	return match?.[0] ?? '';
}

export function detectAuthIssue(error: unknown): AuthIssue {
	const code = codeFromError(error);
	if (!code) {
		return null;
	}

	if (code === 'auth/too-many-requests') {
		return 'too-many-requests';
	}

	if (code === 'auth/invalid-app-credential') {
		return 'invalid-app-credential';
	}

	if (code === 'auth/captcha-check-failed') {
		return 'captcha-check-failed';
	}

	if (code === 'auth/invalid-phone-number') {
		return 'invalid-phone-number';
	}

	if (code === 'auth/billing-not-enabled') {
		return 'billing-not-enabled';
	}

	if (code === 'auth/invalid-email') {
		return 'invalid-email';
	}

	if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
		return 'invalid-credential';
	}

	if (code === 'auth/user-not-found') {
		return 'user-not-found';
	}

	if (code === 'auth/email-already-in-use') {
		return 'email-already-in-use';
	}

	if (code === 'auth/weak-password') {
		return 'weak-password';
	}

	if (code === 'auth/network-request-failed') {
		return 'network-request-failed';
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

	if (issue === 'invalid-email') {
		return 'Enter a valid email address and try again.';
	}

	if (issue === 'invalid-credential') {
		return 'Email or password is incorrect.';
	}

	if (issue === 'user-not-found') {
		return 'No account was found for this email.';
	}

	if (issue === 'email-already-in-use') {
		return 'This email is already in use. Try signing in instead.';
	}

	if (issue === 'weak-password') {
		return 'Password must be at least 6 characters.';
	}

	if (issue === 'network-request-failed') {
		return 'Network connection issue. Please try again.';
	}

	return productionLike
		? 'We could not complete sign in right now. Please try again.'
		: 'We could not sign you in right now. Please try again.';
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

export function toUserSafePurchaseMessage(error: unknown): string {
	const message = messageFromError(error);
	if (!message) {
		return 'Purchase could not be completed. Please try again.';
	}

	if (message.includes('At least one ticket item is required')) {
		return 'Select at least one ticket before checkout.';
	}

	if (message.includes('Too many ticket types in one order')) {
		return 'Too many ticket types selected. Please reduce your order and try again.';
	}

	if (message.includes('Event was not found') || message.includes('Event is not available for purchase')) {
		return 'This event is no longer available for ticket purchases.';
	}

	if (message.includes('Ticket tier') && message.includes('not found')) {
		return 'One or more selected tickets are no longer available. Refresh and try again.';
	}

	if (message.includes('Exceeds max quantity')) {
		return 'Selected quantity exceeds the ticket limit for this tier.';
	}

	const lower = message.toLowerCase();
	if (lower.includes('unauthenticated') || lower.includes('authentication is required')) {
		return 'Sign in is required to complete your purchase.';
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

	return 'Purchase could not be completed. Please try again.';
}

export function toUserSafeTableRequestMessage(error: unknown): string {
	const message = messageFromError(error);
	if (!message) {
		return 'Table request could not be submitted. Please try again.';
	}

	const lower = message.toLowerCase();

	if (message.includes('Event was not found') || message.includes('Event is not available for table requests')) {
		return 'This event is no longer accepting table requests.';
	}

	if (message.includes('firstName is required') || message.includes('lastName is required')) {
		return 'Enter your full name to continue.';
	}

	if (message.includes('email must be a valid email address')) {
		return 'Enter a valid email address.';
	}

	if (message.includes('phone must be a valid US phone number')) {
		return 'Enter a valid US phone number.';
	}

	if (lower.includes('unauthenticated') || lower.includes('authentication is required')) {
		return 'Sign in is required to submit a table request.';
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

	return 'Table request could not be submitted. Please try again.';
}
