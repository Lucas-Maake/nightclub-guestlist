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

function isLocalHost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isDebugHostnameAllowed(hostname: string): boolean {
	if (!hostname) {
		return false;
	}

	return isLocalHost(hostname);
}

export function isProductionLikeHostname(hostname: string): boolean {
	if (!hostname) {
		return true;
	}

	return !isLocalHost(hostname);
}

export function isProductionLikeRuntime(): boolean {
	if (typeof window === 'undefined') {
		return !import.meta.env.DEV;
	}

	if (import.meta.env.DEV) {
		return false;
	}

	return isProductionLikeHostname(window.location.hostname);
}

export function canUseDebugMode(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	return import.meta.env.DEV || isDebugHostnameAllowed(window.location.hostname);
}
