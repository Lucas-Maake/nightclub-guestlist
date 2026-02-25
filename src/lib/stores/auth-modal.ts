import { writable } from 'svelte/store';

export type AuthModalResult = 'authenticated' | 'dismissed';

type OpenOptions = {
	returnTo?: string;
	source?: string;
};

type AuthModalState = {
	open: boolean;
	returnTo: string;
	source: string | null;
};

const initialState: AuthModalState = {
	open: false,
	returnTo: '/',
	source: null
};

const stateStore = writable<AuthModalState>({ ...initialState });

let pendingResolve: ((result: AuthModalResult) => void) | null = null;
let pendingPromise: Promise<AuthModalResult> | null = null;

function sanitizeReturnTo(value: string | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('/login')) {
		return '/';
	}

	return value;
}

function finish(result: AuthModalResult): void {
	if (pendingResolve) {
		pendingResolve(result);
	}

	pendingResolve = null;
	pendingPromise = null;
	stateStore.set({ ...initialState });
}

export const authModalState = {
	subscribe: stateStore.subscribe
};

export function openAuthModal(options: OpenOptions = {}): Promise<AuthModalResult> {
	const returnTo = sanitizeReturnTo(options.returnTo);

	stateStore.set({
		open: true,
		returnTo,
		source: options.source ?? null
	});

	if (pendingPromise) {
		return pendingPromise;
	}

	pendingPromise = new Promise<AuthModalResult>((resolve) => {
		pendingResolve = resolve;
	});

	return pendingPromise;
}

export function closeAuthModal(): void {
	finish('dismissed');
}

export function completeAuthModal(): void {
	finish('authenticated');
}
