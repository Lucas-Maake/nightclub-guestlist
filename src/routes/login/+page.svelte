<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import type { ConfirmationResult } from 'firebase/auth';
	import AppHeader from '$lib/components/common/app-header.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input, Label } from '$lib/components/ui/input';
	import {
		authReady,
		clearRecaptcha,
		confirmPhoneOtp,
		currentUser,
		parseReturnTo,
		sendPhoneOtp,
		setupRecaptcha,
		waitForAuthReady
	} from '$lib/firebase/auth';
	import { pushToast } from '$lib/stores/toast';

	let phone = '';
	let otp = '';
	let loading = false;
	let currentStep: 'phone' | 'code' = 'phone';
	let confirmationResult: ConfirmationResult | null = null;
	let errorMessage = '';
	type AuthIssue =
		| 'invalid-app-credential'
		| 'captcha-check-failed'
		| 'invalid-phone-number'
		| 'too-many-requests'
		| 'billing-not-enabled'
		| null;
	let authIssue: AuthIssue = null;
	let returnTo = '/';

	function parseAuthError(error: unknown): { message: string; issue: AuthIssue } {
		if (!(error instanceof Error)) {
			return { message: 'Unable to send OTP.', issue: null };
		}

		const message = error.message;
		if (message.includes('auth/too-many-requests')) {
			return {
				message:
					'Too many OTP attempts were detected. Wait 30-60 minutes, then retry this number.',
				issue: 'too-many-requests'
			};
		}
		if (message.includes('auth/invalid-app-credential')) {
			return {
				message:
					'Invalid app credential from reCAPTCHA. Complete the challenge, then retry. If this persists, verify localhost is an authorized Firebase Auth domain.',
				issue: 'invalid-app-credential'
			};
		}
		if (message.includes('auth/captcha-check-failed')) {
			return {
				message: 'reCAPTCHA verification failed or expired. Complete reCAPTCHA again and retry.',
				issue: 'captcha-check-failed'
			};
		}
		if (message.includes('auth/invalid-phone-number')) {
			return {
				message: 'Phone number format is invalid. Use a valid E.164 number, for example +16105551234.',
				issue: 'invalid-phone-number'
			};
		}
		if (message.includes('auth/billing-not-enabled')) {
			return {
				message: 'Firebase billing is not enabled for real SMS OTP on this project.',
				issue: 'billing-not-enabled'
			};
		}

		return { message, issue: null };
	}

	function normalizePhone(value: string): string {
		const trimmed = value.trim();
		const digits = trimmed.replace(/\D/g, '');
		if (digits.length === 10) {
			return `+1${digits}`;
		}

		return `+${digits}`;
	}

	onMount(async () => {
		await waitForAuthReady();
		const params = new URLSearchParams($page.url.search);
		returnTo = parseReturnTo(params, '/');

		if ($currentUser) {
			await goto(returnTo);
			return;
		}

		try {
			await setupRecaptcha('recaptcha-container');
		} catch (error) {
			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;
		}
	});

	onDestroy(() => {
		clearRecaptcha();
	});

	$: if ($authReady && $currentUser) {
		goto(returnTo);
	}

	async function handleSendOtp(): Promise<void> {
		errorMessage = '';
		authIssue = null;
		loading = true;

		try {
			const verifier = await setupRecaptcha('recaptcha-container');
			confirmationResult = await sendPhoneOtp(normalizePhone(phone), verifier);
			currentStep = 'code';
			pushToast({
				title: 'OTP sent',
				description: 'Check your SMS for the 6-digit verification code.',
				variant: 'success'
			});
		} catch (error) {
			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;

			// Reset verifier after invalid/expired captcha so the next attempt can succeed.
			if (
				error instanceof Error &&
				(error.message.includes('auth/invalid-app-credential') ||
					error.message.includes('auth/captcha-check-failed'))
			) {
				clearRecaptcha();
				try {
					await setupRecaptcha('recaptcha-container');
				} catch (setupError) {
					const parsedSetupError = parseAuthError(setupError);
					errorMessage = parsedSetupError.message;
					authIssue = parsedSetupError.issue;
				}
			}
		} finally {
			loading = false;
		}
	}

	async function handleVerifyCode(): Promise<void> {
		if (!confirmationResult) {
			errorMessage = 'Request OTP first.';
			authIssue = null;
			return;
		}

		errorMessage = '';
		authIssue = null;
		loading = true;

		try {
			await confirmPhoneOtp(confirmationResult, otp);
			pushToast({
				title: 'Logged in',
				description: 'Redirecting you back to your reservation flow.',
				variant: 'success'
			});
			await goto(returnTo);
		} catch (error) {
			const parsed = parseAuthError(error);
			errorMessage = parsed.message;
			authIssue = parsed.issue;
		} finally {
			loading = false;
		}
	}
</script>

<AppHeader />

<main class="app-shell py-8 sm:py-12">
	<div class="mx-auto w-full max-w-xl">
		<Card>
			<CardHeader>
				<CardTitle>Phone login</CardTitle>
				<CardDescription>
					Sign in with Firebase OTP to create reservations, run host view, and manage check-in.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-6">
				<div class="space-y-2">
					<Label for="phone">Phone number</Label>
					<Input
						id="phone"
						type="tel"
						placeholder="+1 555 123 4567"
						bind:value={phone}
						disabled={currentStep === 'code'}
					/>
				</div>

				{#if currentStep === 'code'}
					<div class="space-y-2">
						<Label for="otp">Verification code</Label>
						<Input id="otp" inputmode="numeric" maxlength={6} placeholder="123456" bind:value={otp} />
					</div>
				{/if}

				<div id="recaptcha-container" class={currentStep === 'code' ? 'hidden' : ''}></div>

				{#if errorMessage}
					<p class="rounded-2xl border border-destructive/35 bg-destructive/15 px-4 py-3 text-sm text-destructive-foreground">
						{errorMessage}
					</p>
				{/if}

				{#if authIssue === 'too-many-requests'}
					<div class="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-sm">
						<p class="font-medium text-foreground">Rate limit guidance</p>
						<ul class="mt-2 space-y-1 text-xs text-muted-foreground">
							<li>Wait 30-60 minutes before retrying this real phone number.</li>
							<li>For immediate local QA, use Firebase test phone numbers.</li>
							<li>Retry from a different network if throttling persists.</li>
						</ul>
					</div>
				{:else if authIssue === 'invalid-app-credential' || authIssue === 'captcha-check-failed'}
					<div class="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-sm">
						<p class="font-medium text-foreground">reCAPTCHA recovery steps</p>
						<ul class="mt-2 space-y-1 text-xs text-muted-foreground">
							<li>Complete the reCAPTCHA challenge and ensure the checkmark is visible.</li>
							<li>Hard refresh and retry once.</li>
							<li>For local QA, use Firebase test phone numbers as fallback.</li>
						</ul>
					</div>
				{:else if authIssue === 'billing-not-enabled'}
					<div class="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-sm">
						<p class="font-medium text-foreground">Billing required for real OTP</p>
						<p class="mt-2 text-xs text-muted-foreground">
							Real SMS OTP requires Firebase Blaze billing. Test numbers continue to work without live SMS.
						</p>
					</div>
				{/if}

				<div class="flex flex-wrap gap-3">
					{#if currentStep === 'phone'}
						<Button onclick={handleSendOtp} disabled={loading || phone.trim().length < 8}>
							{loading ? 'Sending...' : 'Send OTP'}
						</Button>
					{:else}
						<Button onclick={handleVerifyCode} disabled={loading || otp.trim().length < 6}>
							{loading ? 'Verifying...' : 'Verify and Continue'}
						</Button>
						<Button
							variant="outline"
							onclick={() => {
								currentStep = 'phone';
								otp = '';
							}}
						>
							Edit phone
						</Button>
					{/if}
				</div>
			</CardContent>
		</Card>
	</div>
</main>
