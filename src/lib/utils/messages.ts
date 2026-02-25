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
	const issue = detectAuthIssue(error);
	if (productionLike) {
		if (issue === 'too-many-requests') {
			return 'Too many attempts were detected. Please wait 30-60 minutes and try again.';
		}

		if (issue === 'invalid-phone-number') {
			return 'Enter a valid phone number and try again.';
		}

		return 'We could not complete phone verification. Please try again.';
	}

	if (!(error instanceof Error)) {
		return 'Unable to send code.';
	}

	if (issue === 'too-many-requests') {
		return 'Too many OTP attempts were detected. Wait 30-60 minutes, then retry this number.';
	}

	if (issue === 'invalid-app-credential') {
		return 'Invalid app credential from reCAPTCHA. Complete the challenge, then retry. If this persists, verify localhost is an authorized Firebase Auth domain.';
	}

	if (issue === 'captcha-check-failed') {
		return 'reCAPTCHA verification failed or expired. Complete reCAPTCHA again and retry.';
	}

	if (issue === 'invalid-phone-number') {
		return 'Phone number format is invalid. Use a valid E.164 number, for example +16105551234.';
	}

	if (issue === 'billing-not-enabled') {
		return 'Firebase billing is not enabled for real SMS OTP on this project.';
	}

	return error.message;
}

export function toUserSafeCreateMessage(error: unknown, productionLike: boolean): string {
	if (!productionLike) {
		if (!(error instanceof Error)) {
			return 'Unable to create reservation.';
		}

		const message = error.message;
		if (
			message.includes('firestore.googleapis.com') ||
			message.includes('Cloud Firestore API has not been used') ||
			message.includes('SERVICE_DISABLED')
		) {
			return 'Cloud Firestore is not enabled for this Firebase project. Enable Firestore in Firebase Console and Cloud Firestore API in Google Cloud, then retry.';
		}

		return message;
	}

	const message = messageFromError(error).toLowerCase();
	if (message.includes('timed out') || message.includes('deadline')) {
		return 'This request timed out. Please try again.';
	}

	return 'We could not create the reservation right now. Please try again.';
}

export function toUserSafeRsvpMessage(error: unknown, productionLike: boolean): string {
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

	if (productionLike) {
		return 'We could not save your RSVP right now. Please try again.';
	}

	return message;
}
