<script lang="ts">
	import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input, Label } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { currentUser, waitForAuthReady } from '$lib/firebase/auth';
	import { createTicketPurchase } from '$lib/firebase/firestore';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import type { EventCatalogItem, EventTablePackage } from '$lib/data/events';
	import { toUserSafePurchaseMessage } from '$lib/utils/messages';

	type Props = {
		open: boolean;
		event: EventCatalogItem;
		tablePackage: EventTablePackage | null;
		onClose: () => void;
		onSuccess: (purchaseId: string) => void;
	};

	let { open, event, tablePackage, onClose, onSuccess }: Props = $props();

	let processing = $state(false);
	let purchaseComplete = $state(false);
	let errorMessage = $state('');
	let displayName = $state('');

	const currencyFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});
	const dateLineFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
	const timeFormatter = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	});

	const checkoutCents = $derived(tablePackage?.depositCents ?? 0);

	function formatPrice(cents: number): string {
		return currencyFormatter.format(cents / 100);
	}

	function eventDateLine(): string {
		const start = new Date(event.startAt);
		const end = new Date(event.endAt);
		return `${dateLineFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	async function handleCheckout(): Promise<void> {
		if (!tablePackage || processing || purchaseComplete) {
			return;
		}

		if (!$currentUser) {
			const returnTo = typeof window === 'undefined' ? '/event' : window.location.pathname;
			const authResult = await openAuthModal({
				returnTo,
				source: 'table-package-purchase'
			});
			if (authResult !== 'authenticated') {
				errorMessage = 'Sign in is required to continue.';
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

		await new Promise((resolve) => setTimeout(resolve, 800));

		try {
			const result = await createTicketPurchase({
				eventId: event.id,
				displayName: finalDisplayName,
				phone: $currentUser?.phoneNumber ?? undefined,
				items: [{ tierId: tablePackage.id, quantity: 1 }]
			});

			purchaseComplete = true;

			setTimeout(() => {
				onSuccess(result.purchaseId);
			}, 1500);
		} catch (error) {
			errorMessage = toUserSafePurchaseMessage(error);
			processing = false;
		}
	}

	function handleClose(): void {
		if (processing) {
			return;
		}

		purchaseComplete = false;
		errorMessage = '';
		onClose();
	}

	function handleDialogChange(event: CustomEvent<boolean>): void {
		if (!event.detail) {
			handleClose();
		}
	}

	$effect(() => {
		if ($currentUser?.displayName && !displayName) {
			displayName = $currentUser.displayName;
		}
	});

	$effect(() => {
		if (!open) {
			processing = false;
			purchaseComplete = false;
			errorMessage = '';
		}
	});
</script>

<Dialog
	{open}
	closeOnBackdrop={!processing}
	on:openChange={handleDialogChange}
	class="max-w-[620px] border-zinc-700 bg-[#13161d] text-zinc-100"
>
	<DialogHeader>
		<DialogTitle class="text-lg font-semibold text-white">Table Package Information</DialogTitle>
		<DialogDescription class="text-zinc-400">
			{tablePackage ? `${tablePackage.sectionLabel} at ${event.venue}` : 'Select a table package'}
		</DialogDescription>
	</DialogHeader>

	{#if purchaseComplete}
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
				<span
					class="pointer-events-none absolute -inset-2 rounded-full border-2 border-success/40 animate-ping"
				></span>
				<span
					class="pointer-events-none absolute -inset-4 rounded-full border border-success/25 animate-ping"
					style="animation-delay: 150ms"
				></span>
			</div>
			<p class="mt-4 text-lg font-semibold text-foreground">You're all set!</p>
			<p class="mt-1 text-sm text-muted-foreground">Your table package is confirmed.</p>
		</div>
	{:else if tablePackage}
		<div class="mt-4 space-y-4">
			<div class="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
				<div class="h-16 w-16 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
					{#if event.posterImageUrl}
						<img
							src={event.posterImageUrl}
							alt={`Poster for ${event.title}`}
							class="h-full w-full object-cover"
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<div class={`h-full w-full ${event.posterClass}`}></div>
					{/if}
				</div>
				<div class="min-w-0">
					<p class="truncate text-base font-bold text-white">{event.title}</p>
					<p class="truncate text-sm text-zinc-300">{event.venue}</p>
					<p class="truncate text-xs text-zinc-400">{eventDateLine()}</p>
				</div>
			</div>

			<div class="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
				<div class="grid grid-cols-2 gap-3 text-sm">
					<p class="text-zinc-400">Table section</p>
					<p class="text-right font-semibold text-zinc-100">{tablePackage.sectionLabel}</p>
					<p class="text-zinc-400">Capacity</p>
					<p class="text-right font-semibold text-zinc-100">{tablePackage.capacity} Guests</p>
					<p class="text-zinc-400">Minimum Spend</p>
					<p class="text-right font-semibold text-zinc-100">{formatPrice(tablePackage.minSpendCents)}</p>
					<p class="text-zinc-400">Deposit Subtotal</p>
					<p class="text-right font-semibold text-zinc-100">{formatPrice(tablePackage.depositCents)}</p>
				</div>
				<Separator class="my-3 bg-zinc-700" />
				<div class="flex items-center justify-between gap-3 text-sm font-semibold">
					<span class="text-zinc-300">Total</span>
					<span class="text-violet-300">{formatPrice(checkoutCents)}</span>
				</div>
			</div>

			<div class="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3 text-sm text-zinc-300">
				<p class="font-semibold text-white">
					{event.packageDetails?.heading ?? 'Package Details'}
				</p>
				{#if event.packageDetails?.summary}
					<p class="mt-2">{event.packageDetails.summary}</p>
				{/if}
				{#if event.packageDetails?.intro}
					<p class="mt-2">{event.packageDetails.intro}</p>
				{/if}
				{#if event.packageDetails?.inclusions && event.packageDetails.inclusions.length > 0}
					<div class="mt-2 space-y-1.5">
						{#each event.packageDetails.inclusions as inclusion (inclusion)}
							<p>{inclusion}</p>
						{/each}
					</div>
				{/if}
				{#if event.packageDetails?.policy}
					<p class="mt-3 text-zinc-400">{event.packageDetails.policy}</p>
				{/if}
			</div>

			{#if !$currentUser}
				<p class="text-sm text-zinc-300">Sign in to continue to checkout and reserve this package.</p>
			{:else}
				<div class="space-y-2">
					<Label for="tablePackageName" class="text-zinc-200">Your Name</Label>
					<Input
						id="tablePackageName"
						bind:value={displayName}
						placeholder="Full name for your booking"
						class="border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500"
						disabled={processing}
						oninput={() => {
							errorMessage = '';
						}}
					/>
				</div>
			{/if}

			{#if errorMessage}
				<p class="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
					{errorMessage}
				</p>
			{/if}

			<div class="flex gap-3">
				<Button class="flex-1" onclick={handleCheckout} disabled={processing}>
					{processing ? 'Processing...' : `Checkout ${formatPrice(checkoutCents)}`}
				</Button>
				<Button variant="outline" onclick={handleClose} disabled={processing}>Cancel</Button>
			</div>

			<p class="text-center text-xs text-zinc-500">This is a demo checkout. No real payment is processed.</p>
		</div>
	{:else}
		<div class="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/70 p-4 text-sm text-zinc-300">
			Package unavailable.
		</div>
	{/if}
</Dialog>
