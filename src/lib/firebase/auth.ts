import { browser } from '$app/environment';
import {
	RecaptchaVerifier,
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	signOut,
	signInAnonymously,
	signInWithEmailAndPassword,
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

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function normalizePassword(value: string): string {
	return value.trim();
}

function codeFromAuthError(error: unknown): string {
	if (
		error &&
		typeof error === 'object' &&
		typeof (error as { code?: unknown }).code === 'string'
	) {
		return (error as { code: string }).code;
	}

	if (error instanceof Error) {
		const match = error.message.match(/auth\/[a-z-]+/);
		return match?.[0] ?? '';
	}

	return '';
}

function isUserNotFoundError(error: unknown): boolean {
	return codeFromAuthError(error) === 'auth/user-not-found';
}

function isInvalidCredentialError(error: unknown): boolean {
	return codeFromAuthError(error) === 'auth/invalid-credential';
}

function isEmailAlreadyInUseError(error: unknown): boolean {
	return codeFromAuthError(error) === 'auth/email-already-in-use';
}

async function tryCreateAfterUnknownEmail(
	email: string,
	password: string,
	originalError: unknown
): Promise<{ user: User; mode: 'signup' }> {
	try {
		const user = await createEmailAccount(email, password);
		return { user, mode: 'signup' };
	} catch (createError) {
		// Existing account + wrong password can surface as invalid-credential on sign-in.
		// If create says email is already in use, preserve the original sign-in error.
		if (isEmailAlreadyInUseError(createError)) {
			throw originalError;
		}

		throw createError;
	}
}

function hasUnknownAccountError(error: unknown): boolean {
	if (
		error &&
		typeof error === 'object' &&
		typeof (error as { code?: unknown }).code === 'string' &&
		(error as { code: string }).code === 'auth/user-not-found'
	) {
		return true;
	}

	return (
		(error instanceof Error && error.message.includes('auth/user-not-found')) ||
		isInvalidCredentialError(error)
	);
}

export async function signInWithEmailCredentials(email: string, password: string): Promise<User> {
	const credentials = await signInWithEmailAndPassword(
		auth,
		normalizeEmail(email),
		normalizePassword(password)
	);
	return credentials.user;
}

export async function createEmailAccount(email: string, password: string): Promise<User> {
	const credentials = await createUserWithEmailAndPassword(
		auth,
		normalizeEmail(email),
		normalizePassword(password)
	);
	return credentials.user;
}

export async function signInOrCreateWithEmail(
	email: string,
	password: string
): Promise<{ user: User; mode: 'signin' | 'signup' }> {
	try {
		const user = await signInWithEmailCredentials(email, password);
		return { user, mode: 'signin' };
	} catch (error) {
		if (isUserNotFoundError(error)) {
			const user = await createEmailAccount(email, password);
			return { user, mode: 'signup' };
		}

		if (!hasUnknownAccountError(error)) {
			throw error;
		}

		return tryCreateAfterUnknownEmail(email, password, error);
	}
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
