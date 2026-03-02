import type { ToastItem } from '$lib/stores/toast';
import type { GuestRecord } from '$lib/types/models';

export function isGuestEligibleForCheckIn(status: GuestRecord['status']): boolean {
	return status === 'accepted';
}

export function resolveGuestCheckInState(
	uid: string,
	checkedInAt: GuestRecord['checkedInAt'] | null | undefined,
	pending: Record<string, boolean>
): boolean {
	const pendingValue = pending[uid];
	if (pendingValue !== undefined) {
		return pendingValue;
	}

	return Boolean(checkedInAt);
}

export function clearPendingGuest(
	pending: Record<string, boolean>,
	uid: string
): Record<string, boolean> {
	if (pending[uid] === undefined) {
		return pending;
	}

	const next = { ...pending };
	delete next[uid];
	return next;
}

export function createUndoCheckInToast(
	checkedIn: boolean,
	guestName: string,
	onUndo: () => void
): Omit<ToastItem, 'id'> {
	return {
		title: checkedIn ? 'Checked in' : 'Check-in removed',
		description: guestName.trim() || 'Guest',
		variant: 'success',
		action: {
			label: 'Undo',
			onClick: onUndo
		}
	};
}
