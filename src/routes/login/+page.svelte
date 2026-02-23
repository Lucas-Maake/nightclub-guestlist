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
	let returnTo = '/';

	function formatAuthError(error: unknown): string {
		if (!(error instanceof Error)) {
			return 'Unable to send OTP.';
		}

		const message = error.message;
		if (message.includes('auth/invalid-app-credential')) {
			return 'Invalid app credential from reCAPTCHA. Complete the challenge, then retry. If this persists, verify localhost is an authorized Firebase Auth domain.';
		}
		if (message.includes('auth/captcha-check-failed')) {
			return 'reCAPTCHA verification failed or expired. Complete reCAPTCHA again and retry.';
		}
		if (message.includes('auth/invalid-phone-number')) {
			return 'Phone number format is invalid. Use a valid E.164 number, for example +16105551234.';
		}

		return message;
	}

	function normalizePhone(value: string): string {
		const trimmed = value.trim();
		if (trimmed.startsWith('+')) {
			return trimmed;
		}

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
			errorMessage =
				error instanceof Error
					? error.message
					: 'Unable to initialize phone auth. Check Firebase config and emulator status.';
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
			errorMessage = formatAuthError(error);

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
					errorMessage = formatAuthError(setupError);
				}
			}
		} finally {
			loading = false;
		}
	}

	async function handleVerifyCode(): Promise<void> {
		if (!confirmationResult) {
			errorMessage = 'Request OTP first.';
			return;
		}

		errorMessage = '';
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
			errorMessage = error instanceof Error ? error.message : 'Invalid verification code.';
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
