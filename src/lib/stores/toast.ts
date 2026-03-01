import { writable } from 'svelte/store';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface ToastItem {
	id: string;
	title: string;
	description?: string;
	variant?: ToastVariant;
	action?: ToastAction;
}

const toastsStore = writable<ToastItem[]>([]);

function randomId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function pushToast(item: Omit<ToastItem, 'id'>, timeoutMs = 2400): void {
	const toast: ToastItem = { id: randomId(), ...item };

	toastsStore.update((current) => [...current, toast]);

	window.setTimeout(() => {
		dismissToast(toast.id);
	}, timeoutMs);
}

export function dismissToast(id: string): void {
	toastsStore.update((current) => current.filter((toast) => toast.id !== id));
}

export const toasts = {
	subscribe: toastsStore.subscribe
};
