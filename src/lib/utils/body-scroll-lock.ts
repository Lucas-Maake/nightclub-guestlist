let lockCount = 0;
let savedScrollY = 0;
let previousHtmlOverflow = '';
let previousBodyOverflow = '';
let previousBodyPosition = '';
let previousBodyTop = '';
let previousBodyLeft = '';
let previousBodyRight = '';
let previousBodyWidth = '';

export function lockBodyScroll(): void {
	if (typeof document === 'undefined') {
		return;
	}

	if (lockCount === 0) {
		const { body, documentElement } = document;
		savedScrollY = window.scrollY;
		previousHtmlOverflow = documentElement.style.overflow;
		previousBodyOverflow = body.style.overflow;
		previousBodyPosition = body.style.position;
		previousBodyTop = body.style.top;
		previousBodyLeft = body.style.left;
		previousBodyRight = body.style.right;
		previousBodyWidth = body.style.width;

		documentElement.style.overflow = 'hidden';
		body.style.overflow = 'hidden';
		body.style.position = 'fixed';
		body.style.top = `-${savedScrollY}px`;
		body.style.left = '0';
		body.style.right = '0';
		body.style.width = '100%';
	}

	lockCount += 1;
}

export function unlockBodyScroll(): void {
	if (typeof document === 'undefined' || lockCount === 0) {
		return;
	}

	lockCount -= 1;

	if (lockCount === 0) {
		const { body, documentElement } = document;
		documentElement.style.overflow = previousHtmlOverflow;
		body.style.overflow = previousBodyOverflow;
		body.style.position = previousBodyPosition;
		body.style.top = previousBodyTop;
		body.style.left = previousBodyLeft;
		body.style.right = previousBodyRight;
		body.style.width = previousBodyWidth;
		window.scrollTo(0, savedScrollY);

		savedScrollY = 0;
		previousHtmlOverflow = '';
		previousBodyOverflow = '';
		previousBodyPosition = '';
		previousBodyTop = '';
		previousBodyLeft = '';
		previousBodyRight = '';
		previousBodyWidth = '';
	}
}
