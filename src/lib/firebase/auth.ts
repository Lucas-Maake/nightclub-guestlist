import { browser } from '$app/environment';
import {
	RecaptchaVerifier,
	onAuthStateChanged,
	signOut,
	signInAnonymously,
	signInWithPhoneNumber,
	type ConfirmationResult,
	type User
} from 'firebase/auth';
import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { auth } from './client';
import { upsertUserRecord } from './firestore';

const userStore = writable<User | null>(null);
const authReadyStore = writable(false);

let initialized = false;
let recaptchaVerifier: RecaptchaVerifier | null = null;

function initializeAuthListener(): void {
	if (!browser || initialized) {
		return;
	}

	initialized = true;
	onAuthStateChanged(auth, async (user) => {
		userStore.set(user);
		authReadyStore.set(true);

		if (user) {
			try {
				await upsertUserRecord(user.uid, user.phoneNumber, user.displayName ?? null);
			} catch (error) {
				// Do not fail auth flow if profile write is temporarily unavailable.
				console.error('Failed to upsert user profile', error);
			}
		}
	});
}

initializeAuthListener();

export const currentUser = {
	subscribe: userStore.subscribe
};

export const authReady = {
	subscribe: authReadyStore.subscribe
};

export function getCurrentUser(): User | null {
	return get(userStore);
}

export async function waitForAuthReady(): Promise<void> {
	if (get(authReadyStore)) {
		return;
	}

	await new Promise<void>((resolve) => {
		const unsubscribe = authReadyStore.subscribe((ready) => {
			if (ready) {
				unsubscribe();
				resolve();
			}
		});
	});
}

export async function signInAnonymouslyForDebug(): Promise<void> {
	await signInAnonymously(auth);
}

export async function setupRecaptcha(containerId: string): Promise<RecaptchaVerifier> {
	if (!browser) {
		throw new Error('Phone auth is only available in browser.');
	}

	if (recaptchaVerifier) {
		return recaptchaVerifier;
	}

	recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
		size: 'normal'
	});

	await recaptchaVerifier.render();
	return recaptchaVerifier;
}

export function clearRecaptcha(): void {
	if (!recaptchaVerifier) {
		return;
	}

	recaptchaVerifier.clear();
	recaptchaVerifier = null;
}

export async function sendPhoneOtp(
	phoneNumber: string,
	verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
	return signInWithPhoneNumber(auth, phoneNumber, verifier);
}

export async function confirmPhoneOtp(
	confirmationResult: ConfirmationResult,
	code: string
): Promise<User> {
	const credentials = await confirmationResult.confirm(code);
	return credentials.user;
}

export async function signOutCurrentUser(): Promise<void> {
	await signOut(auth);
}

export function parseReturnTo(search: URLSearchParams, fallback = '/'): string {
	const returnTo = search.get('returnTo');
	if (!returnTo || !returnTo.startsWith('/')) {
		return fallback;
	}

	return returnTo;
}
