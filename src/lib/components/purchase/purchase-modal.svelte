<script lang="ts">
	import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input, Label } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { createTicketPurchase } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { EventCatalogItem } from '$lib/data/events';
	import { toUserSafePurchaseMessage } from '$lib/utils/messages';

	type Props = {
		open: boolean;
		event: EventCatalogItem;
		quantities: Record<string, number>;
		onClose: () => void;
		onSuccess: (purchaseId: string) => void;
	};

	let { open, event, quantities, onClose, onSuccess }: Props = $props();

	let processing = $state(false);
	let purchaseComplete = $state(false);
	let errorMessage = $state('');
	let displayName = $state('');

	const currencyFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});

	const orderItems = $derived(
		event.ticketTiers
			.filter((tier) => (quantities[tier.id] ?? 0) > 0)
			.map((tier) => ({
				tier,
				quantity: quantities[tier.id],
				lineTotalCents: tier.priceCents * quantities[tier.id]
			}))
	);

	const subtotalCents = $derived(orderItems.reduce((sum, item) => sum + item.lineTotalCents, 0));

	const totalTickets = $derived(orderItems.reduce((sum, item) => sum + item.quantity, 0));

	function formatPrice(cents: number): string {
		return currencyFormatter.format(cents / 100);
	}

	async function handlePurchase(): Promise<void> {
		if (processing || purchaseComplete) {
			return;
		}

		// Auth check
		if (!$currentUser) {
			const authResult = await openAuthModal({
				returnTo: window.location.pathname,
				source: 'ticket-purchase'
			});
			if (authResult !== 'authenticated') {
				errorMessage = 'Sign in is required to complete your purchase.';
				return;
			}
			await waitForAuthReady();
		}

		const finalDisplayName = displayName.trim() || $currentUser?.displayName || '';
		if (!finalDisplayName) {
			errorMessage = 'Please enter your name.';
			return;
		}

		processing = true;
		errorMessage = '';

		// Simulate processing delay (dummy payment)
		await new Promise((resolve) => setTimeout(resolve, 800));

		try {
			const items = orderItems.map((item) => ({
				tierId: item.tier.id,
				quantity: item.quantity
			}));

			const result = await createTicketPurchase({
				eventId: event.id,
				displayName: finalDisplayName,
				phone: $currentUser?.phoneNumber ?? undefined,
				items
			});

			purchaseComplete = true;

			// Brief celebration delay before callback
			setTimeout(() => {
				onSuccess(result.purchaseId);
			}, 1500);
		} catch (error) {
			errorMessage = toUserSafePurchaseMessage(error);
			processing = false;
		}
	}

	function handleClose(): void {
		if (!processing) {
			purchaseComplete = false;
			errorMessage = '';
			onClose();
		}
	}

	function handleDialogChange(event: CustomEvent<boolean>): void {
		if (!event.detail) {
			handleClose();
		}
	}

	// Hydrate display name from current user
	$effect(() => {
		if ($currentUser?.displayName && !displayName) {
			displayName = $currentUser.displayName;
		}
	});
</script>

<Dialog {open} closeOnBackdrop={!processing} on:openChange={handleDialogChange}>
	<DialogHeader>
		<DialogTitle>
			{purchaseComplete ? 'Purchase Complete!' : 'Complete Your Purchase'}
		</DialogTitle>
		<DialogDescription>
			{purchaseComplete
				? 'Your tickets are confirmed.'
				: `${totalTickets} ticket${totalTickets === 1 ? '' : 's'} for ${event.title}`}
		</DialogDescription>
	</DialogHeader>

	{#if purchaseComplete}
		<!-- Success State with Animation -->
		<div class="relative mt-6 flex flex-col items-center justify-center py-8">
			<div class="relative">
				<span
					class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success"
				>
					<svg
						class="h-8 w-8"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</span>
				<!-- Celebration rings -->
				<span
					class="pointer-events-none absolute -inset-2 rounded-full border-2 border-success/40 animate-ping"
				></span>
				<span
					class="pointer-events-none absolute -inset-4 rounded-full border border-success/25 animate-ping"
					style="animation-delay: 150ms"
				></span>
			</div>
			<p class="mt-4 text-lg font-semibold text-foreground">You're all set!</p>
			<p class="mt-1 text-sm text-muted-foreground">Check your tickets tab for details.</p>
		</div>
	{:else}
		<!-- Order Summary -->
		<div class="mt-4 space-y-4">
			<div class="space-y-2 rounded-2xl border border-border/80 bg-secondary/20 p-4">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Order Summary</p>
				{#each orderItems as item}
					<div class="flex items-center justify-between gap-3 text-sm">
						<span>{item.tier.label} &times; {item.quantity}</span>
						<span class="font-medium">{formatPrice(item.lineTotalCents)}</span>
					</div>
				{/each}
				<Separator class="my-2" />
				<div class="flex items-center justify-between gap-3 text-sm font-semibold">
					<span>Total</span>
					<span class="text-primary">{formatPrice(subtotalCents)}</span>
				</div>
			</div>

			{#if !$currentUser}
				<p class="text-sm text-muted-foreground">
					Sign in to complete your purchase and save your tickets.
				</p>
			{:else}
				<div class="space-y-2">
					<Label for="purchaseName">Your Name</Label>
					<Input
						id="purchaseName"
						bind:value={displayName}
						placeholder="Full name for tickets"
						disabled={processing}
						oninput={() => {
							errorMessage = '';
						}}
					/>
				</div>
			{/if}

			{#if errorMessage}
				<p class="text-sm text-destructive-foreground">{errorMessage}</p>
			{/if}

			<div class="flex gap-3">
				<Button
					class="flex-1"
					onclick={handlePurchase}
					disabled={processing || orderItems.length === 0}
				>
					{processing ? 'Processing...' : `Pay ${formatPrice(subtotalCents)}`}
				</Button>
				<Button variant="outline" onclick={handleClose} disabled={processing}>Cancel</Button>
			</div>

			<p class="text-center text-xs text-muted-foreground">
				This is a demo checkout. No real payment is processed.
			</p>
		</div>
	{/if}
</Dialog>
