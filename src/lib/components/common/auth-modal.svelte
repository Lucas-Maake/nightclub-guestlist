<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, tick } from 'svelte';
	import { quintInOut, quintOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
	import { X } from 'lucide-svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import {
		authReady,
		clearRecaptcha,
		confirmPhoneOtp,
		currentUser,
		sendPhoneOtp,
		signInOrCreateWithEmail,
		setupRecaptcha
	} from '$lib/firebase/auth';
	import { completeAuthModal, authModalState, closeAuthModal } from '$lib/stores/auth-modal';
	import { pushToast } from '$lib/stores/toast';
	import { detectAuthIssue, toUserSafeAuthMessage, type AuthIssue } from '$lib/utils/messages';
	import { isProductionLikeRuntime } from '$lib/utils/security';

	const recaptchaContainerId = 'auth-modal-recaptcha';
	const productionLike = isProductionLikeRuntime();
	const MODAL_BACKDROP_ENTER_MS = 240;
	const MODAL_BACKDROP_EXIT_MS = 200;
	const MODAL_PANEL_ENTER_MS = 320;
	const MODAL_PANEL_EXIT_MS = 260;

	let panelElement = $state<HTMLDivElement | null>(null);
	let phoneInput = $state<HTMLInputElement | null>(null);
	let emailInput = $state<HTMLInputElement | null>(null);

	let phone = $state('');
	let otp = $state('');
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let currentStep = $state<'phone' | 'code' | 'email'>('phone');
	let confirmationResult = $state<ConfirmationResult | null>(null);
	let errorMessage = $state('');
	let authIssue = $state<AuthIssue>(null);
	let recaptchaReady = $state(false);
	let openSnapshot = $state(false);
	let interactionToken = $state(0);

	const stepLabel = $derived.by(() => {
		if (currentStep === 'phone') {
			return 'Step 1 of 2';
		}

		if (currentStep === 'code') {
			return 'Step 2 of 2';
		}

		return 'Email sign in';
	});

	const stepDescription = $derived.by(() => {
		if (currentStep === 'email') {
			return 'Use your email and password to sign in. A new account is created automatically if needed.';
		}

		return 'Use your phone number to log in or create an account.';
	});

	function parseAuthError(error: unknown): { message: string; issue: AuthIssue } {
		return {
			message: toUserSafeAuthMessage(error, productionLike),
			issue: detectAuthIssue(error)
		};
	}

	function normalizePhone(value: string): string {
		const trimmed = value.trim();
		const digits = trimmed.replace(/\D/g, '');
		if (digits.length === 10) {
			return `+1${digits}`;
		}

		return `+${digits}`;
	}

	function setBodyScrollLock(locked: boolean): void {
		if (typeof document === 'undefined') {
			return;
		}

		document.body.style.overflow = locked ? 'hidden' : '';
	}

	function resetModalState(): void {
		phone = '';
		otp = '';
		email = '';
		password = '';
		loading = false;
		currentStep = 'phone';
		confirmationResult = null;
		errorMessage = '';
		authIssue = null;
		recaptchaReady = false;
		interactionToken += 1;
	}

	async function ensureRecaptcha(): Promise<RecaptchaVerifier> {
		const verifier = await setupRecaptcha(recaptchaContainerId);
		recaptchaReady = true;
		return verifier;
	}

	function getFocusableElements(): HTMLElement[] {
		if (!panelElement) {
			return [];
		}

		const query =
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

		return Array.from(panelElement.querySelectorAll<HTMLElement>(query)).filter((element) =>
			Boolean(element.offsetParent || element.getClientRects().length)
		);
	}

	function trapFocus(event: KeyboardEvent): void {
		if (event.key !== 'Tab') {
			return;
		}

		const focusables = getFocusableElements();
		if (focusables.length === 0) {
			return;
		}

		const firstElement = focusables[0];
		const lastElement = focusables[focusables.length - 1];
		const activeElement = document.activeElement as HTMLElement | null;

		if (event.shiftKey && activeElement === firstElement) {
			event.preventDefault();
			lastElement.focus();
			return;
		}

		if (!event.shiftKey && activeElement === lastElement) {
			event.preventDefault();
			firstElement.focus();
		}
	}

	function closeModal(): void {
		closeAuthModal();
	}

	async function finalizeAuthenticated(): Promise<void> {
		const target = $authModalState.returnTo || '/';
		const currentLocation = `${$page.url.pathname}${$page.url.search}`;
		completeAuthModal();
		clearRecaptcha();
		setBodyScrollLock(false);

		if (target !== currentLocation) {
			await goto(target);
		}
	}

	async function initializeModal(): Promise<void> {
		resetModalState();
		await tick();
		phoneInput?.focus();

		if ($currentUser) {
			await finalizeAuthenticated();
			return;
		}

		try {
			await ensureRecaptcha();
		} catch (error) {
			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;
		}
	}

	function handlePanelKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeModal();
			return;
		}

		trapFocus(event);
	}

	function switchToPhoneStep(): void {
		currentStep = 'phone';
		otp = '';
		confirmationResult = null;
		errorMessage = '';
		authIssue = null;
		void tick().then(() => {
			phoneInput?.focus();
		});
	}

	function switchToEmailStep(): void {
		currentStep = 'email';
		otp = '';
		confirmationResult = null;
		errorMessage = '';
		authIssue = null;
		void tick().then(() => {
			emailInput?.focus();
		});
	}

	async function handleSendOtp(): Promise<void> {
		errorMessage = '';
		authIssue = null;
		loading = true;
		const token = interactionToken;

		try {
			const verifier = await ensureRecaptcha();
			const result = await sendPhoneOtp(normalizePhone(phone), verifier);

			if (!$authModalState.open || token !== interactionToken) {
				return;
			}

			confirmationResult = result;
			currentStep = 'code';
			pushToast({
				title: 'Code sent',
				description: 'Check your messages for the 6-digit verification code.',
				variant: 'success'
			});
		} catch (error) {
			if (!$authModalState.open || token !== interactionToken) {
				return;
			}

			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;

			if (
				error instanceof Error &&
				(error.message.includes('auth/invalid-app-credential') ||
					error.message.includes('auth/captcha-check-failed'))
			) {
				clearRecaptcha();
				recaptchaReady = false;
				try {
					await ensureRecaptcha();
				} catch (setupError) {
					const parsedSetupError = parseAuthError(setupError);
					errorMessage = parsedSetupError.message;
					authIssue = parsedSetupError.issue;
				}
			}
		} finally {
			if ($authModalState.open && token === interactionToken) {
				loading = false;
			}
		}
	}

	async function handleVerifyCode(): Promise<void> {
		if (!confirmationResult) {
			errorMessage = 'Request a code first.';
			authIssue = null;
			return;
		}

		errorMessage = '';
		authIssue = null;
		loading = true;
		const token = interactionToken;

		try {
			await confirmPhoneOtp(confirmationResult, otp);
			if (!$authModalState.open || token !== interactionToken) {
				return;
			}

			pushToast({
				title: 'Logged in',
				description: 'You are signed in and can continue.',
				variant: 'success'
			});
			await finalizeAuthenticated();
		} catch (error) {
			if (!$authModalState.open || token !== interactionToken) {
				return;
			}

			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;
		} finally {
			if ($authModalState.open && token === interactionToken) {
				loading = false;
			}
		}
	}

	async function handleEmailSignIn(): Promise<void> {
		errorMessage = '';
		authIssue = null;

		const normalizedEmail = email.trim().toLowerCase();
		const normalizedPassword = password.trim();

		if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
			errorMessage = 'Enter a valid email address and try again.';
			return;
		}

		if (normalizedPassword.length < 6) {
			errorMessage = 'Password must be at least 6 characters.';
			return;
		}

		loading = true;
		const token = interactionToken;

		try {
			const result = await signInOrCreateWithEmail(normalizedEmail, normalizedPassword);
			if (!$authModalState.open || token !== interactionToken) {
				return;
			}

			pushToast({
				title: result.mode === 'signup' ? 'Account created' : 'Logged in',
				description: 'You are signed in and can continue.',
				variant: 'success'
			});
			await finalizeAuthenticated();
		} catch (error) {
			if (!$authModalState.open || token !== interactionToken) {
				return;
			}

			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;
		} finally {
			if ($authModalState.open && token === interactionToken) {
				loading = false;
			}
		}
	}

	$effect(() => {
		const isOpen = $authModalState.open;

		if (isOpen && !openSnapshot) {
			setBodyScrollLock(true);
			void initializeModal();
		}

		if (!isOpen && openSnapshot) {
			clearRecaptcha();
			setBodyScrollLock(false);
			resetModalState();
		}

		openSnapshot = isOpen;
	});

	$effect(() => {
		if (!$authModalState.open || !$authReady || !$currentUser) {
			return;
		}

		void finalizeAuthenticated();
	});

	onDestroy(() => {
		clearRecaptcha();
		setBodyScrollLock(false);
	});
</script>

{#if $authModalState.open}
	<button
		type="button"
		class="fixed inset-0 z-[60] bg-black/75 backdrop-blur-[2px]"
		aria-label="Dismiss sign-in dialog"
		onclick={closeModal}
		in:fade={{ duration: MODAL_BACKDROP_ENTER_MS, easing: quintOut }}
		out:fade={{ duration: MODAL_BACKDROP_EXIT_MS, easing: quintInOut }}
	></button>
	<div class="fixed inset-0 z-[65] grid place-items-center px-4 py-6 sm:py-8">
		<div
			bind:this={panelElement}
			class="w-full max-w-[420px] rounded-2xl bg-white px-6 pb-6 pt-5 text-[#1f2328] shadow-[0_30px_70px_-35px_rgba(0,0,0,0.55)] sm:px-7"
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-modal-title"
			tabindex="-1"
			onkeydown={handlePanelKeydown}
			in:fly={{ y: -8, opacity: 0, duration: MODAL_PANEL_ENTER_MS, easing: quintOut }}
			out:fly={{ y: -6, opacity: 0, duration: MODAL_PANEL_EXIT_MS, easing: quintInOut }}
		>
			<div class="flex justify-end">
				<button
					type="button"
					class="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#8a8f98] transition-colors hover:bg-[#f3f4f6] hover:text-[#3b3f45]"
					onclick={closeModal}
					aria-label="Close sign-in dialog"
				>
					<X class="h-5 w-5" aria-hidden="true" />
				</button>
			</div>

			<div class="mt-2 text-center">
				<div class="mx-auto inline-flex items-center gap-2 rounded-full border border-[#e4e7ec] bg-[#f7f9fc] px-3 py-2 shadow-[0_8px_20px_-14px_rgba(20,25,40,0.45)]">
					<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white" style="--foreground: 222 24% 18%; --primary: 262 90% 62%;">
						<BrandMark class="h-4 w-4" />
					</span>
					<span class="text-[10px] font-bold uppercase tracking-[0.14em] text-[#4b5563]">Nightclub Guestlist</span>
				</div>
				<h2 id="auth-modal-title" class="mt-4 text-[2rem] font-semibold leading-none tracking-tight text-[#20242a]">
					Sign In / Sign Up
				</h2>
				<p class="mt-3 text-base leading-snug text-[#666c75]">{stepDescription}</p>
				<p class="mt-3 text-xs uppercase tracking-[0.18em] text-[#9ca3af]">{stepLabel}</p>
			</div>

			{#if currentStep === 'phone'}
				<div class="mt-6 overflow-hidden rounded-xl border border-[#d7dbe2] bg-white">
					<div class="flex items-center">
						<div class="flex h-14 min-w-[7.5rem] items-center border-r border-[#d7dbe2] px-4 text-base text-[#5f6670]">
							US (+1)
						</div>
						<input
							bind:this={phoneInput}
							type="tel"
							inputmode="tel"
							placeholder="201 555 0123"
							class="h-14 w-full bg-transparent px-4 text-lg text-[#1f2328] outline-none placeholder:text-[#a6acb5]"
							bind:value={phone}
						/>
					</div>
				</div>
			{:else if currentStep === 'code'}
				<div class="mt-6 space-y-2">
					<label for="otp" class="text-sm font-medium text-[#414853]">Verification code</label>
					<input
						id="otp"
						type="text"
						inputmode="numeric"
						maxlength={6}
						placeholder="123456"
						class="h-14 w-full rounded-xl border border-[#d7dbe2] bg-white px-4 text-center text-lg tracking-[0.24em] text-[#1f2328] outline-none placeholder:tracking-normal placeholder:text-[#a6acb5]"
						bind:value={otp}
					/>
					<p class="text-xs text-[#777d87]">Enter the 6-digit code that was sent to your phone.</p>
				</div>
			{:else}
				<div class="mt-6 space-y-4">
					<div class="space-y-2">
						<label for="email" class="text-sm font-medium text-[#414853]">Email</label>
						<input
							bind:this={emailInput}
							id="email"
							type="email"
							inputmode="email"
							autocomplete="email"
							placeholder="you@example.com"
							class="h-14 w-full rounded-xl border border-[#d7dbe2] bg-white px-4 text-base text-[#1f2328] outline-none placeholder:text-[#a6acb5]"
							bind:value={email}
						/>
					</div>
					<div class="space-y-2">
						<label for="password" class="text-sm font-medium text-[#414853]">Password</label>
						<input
							id="password"
							type="password"
							autocomplete="current-password"
							placeholder="At least 6 characters"
							class="h-14 w-full rounded-xl border border-[#d7dbe2] bg-white px-4 text-base text-[#1f2328] outline-none placeholder:text-[#a6acb5]"
							bind:value={password}
						/>
					</div>
				</div>
			{/if}

			{#if currentStep === 'phone'}
				<div class="relative mt-4 h-[86px] overflow-hidden rounded-xl border border-[#e3e6ec] bg-[#f8fafc]">
					{#if !recaptchaReady}
						<div
							class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#7d8692]"
						>
							Loading verification...
						</div>
					{/if}
					<div class="flex h-full items-center justify-center">
						<div
							id={recaptchaContainerId}
							class={recaptchaReady ? 'w-full max-w-[304px]' : 'w-full max-w-[304px] opacity-0'}
						></div>
					</div>
				</div>
			{/if}

			{#if errorMessage}
				<p class="mt-4 rounded-xl border border-[#f3c0c0] bg-[#fff2f2] px-4 py-3 text-sm text-[#a33838]" aria-live="polite">
					{errorMessage}
				</p>
			{/if}

			{#if !productionLike && authIssue === 'too-many-requests'}
				<div class="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 text-xs text-[#5f6670]">
					Wait 30-60 minutes before retrying, or use your local test number setup.
				</div>
			{/if}

			<div class="mt-5 space-y-3">
				{#if currentStep === 'phone'}
					<button
						type="button"
						class="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#23262b] text-lg font-semibold text-white transition-colors hover:bg-[#17191d] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={handleSendOtp}
						disabled={loading || phone.trim().length < 8}
					>
						{loading ? 'Sending...' : 'Continue'}
					</button>
					<button
						type="button"
						class="mx-auto block text-base font-semibold text-[#3173e5] transition-colors hover:text-[#1f5ec9]"
						onclick={switchToEmailStep}
						disabled={loading}
					>
						Use Email Instead
					</button>
				{:else if currentStep === 'code'}
					<button
						type="button"
						class="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#23262b] text-lg font-semibold text-white transition-colors hover:bg-[#17191d] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={handleVerifyCode}
						disabled={loading || otp.trim().length < 6}
					>
						{loading ? 'Verifying...' : 'Verify and Continue'}
					</button>
					<button
						type="button"
						class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#d7dbe2] bg-transparent text-sm font-medium text-[#39404a] transition-colors hover:bg-[#f5f7fa]"
						onclick={switchToPhoneStep}
					>
						Edit phone
					</button>
				{:else}
					<button
						type="button"
						class="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#23262b] text-lg font-semibold text-white transition-colors hover:bg-[#17191d] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={handleEmailSignIn}
						disabled={loading || email.trim().length < 3 || password.trim().length < 6}
					>
						{loading ? 'Signing in...' : 'Sign In with Email'}
					</button>
					<button
						type="button"
						class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#d7dbe2] bg-transparent text-sm font-medium text-[#39404a] transition-colors hover:bg-[#f5f7fa] disabled:cursor-not-allowed disabled:opacity-50"
						onclick={switchToPhoneStep}
						disabled={loading}
					>
						Use phone instead
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
