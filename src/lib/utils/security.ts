import { customAlphabet } from 'nanoid';

const DEBUG_TOKEN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generateId = customAlphabet(DEBUG_TOKEN_ALPHABET, 48);

export function generateDebugToken(): string {
	return generateId();
}

export async function sha256(text: string): Promise<string> {
	const data = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest))
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('');
}

export function isDebugHostnameAllowed(hostname: string): boolean {
	if (!hostname) {
		return false;
	}

	if (hostname === 'localhost' || hostname === '127.0.0.1') {
		return true;
	}

	return hostname.startsWith('staging.');
}

export function canUseDebugMode(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	return import.meta.env.DEV || isDebugHostnameAllowed(window.location.hostname);
}
