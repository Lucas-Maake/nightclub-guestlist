import { browser } from '$app/environment';

function resolveOrigin(): string {
	if (browser) {
		return window.location.origin;
	}

	return import.meta.env.PUBLIC_APP_ORIGIN ?? 'http://localhost:5173';
}

export function invitePath(reservationId: string): string {
	return `/r/${reservationId}`;
}

export function inviteUrl(reservationId: string): string {
	return `${resolveOrigin()}${invitePath(reservationId)}`;
}

export function inviteDebugUrl(reservationId: string, token: string): string {
	return `${inviteUrl(reservationId)}?debug=${encodeURIComponent(token)}`;
}
