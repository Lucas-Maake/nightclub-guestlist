<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { onMount } from 'svelte';
import AppHeader from '$lib/components/common/app-header.svelte';
import PurchaseModal from '$lib/components/purchase/purchase-modal.svelte';
import TablePackageModal from '$lib/components/purchase/table-package-modal.svelte';
import { Calendar, Clock3, MapPinned, Sparkles, Ticket, Users, Zap } from 'lucide-svelte';
import { QuantitySelect } from '$lib/components/ui/quantity-select';
import type { EventCatalogItem, EventTablePackage } from '$lib/data/events';
import { waitForAuthReady } from '$lib/firebase/auth';
import { getPublishedEventById, listPublishedEvents } from '$lib/firebase/firestore';
import { pushToast } from '$lib/stores/toast';

	const dateLineFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
	const timeFormatter = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	});
	const currencyFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});

	const eventId = $derived($page.params.id ?? '');

let eventRecord = $state<EventCatalogItem | null>(null);
let relatedCatalog = $state<EventCatalogItem[]>([]);
let loadingEvent = $state(true);
let purchaseModalOpen = $state(false);
let tablePackageModalOpen = $state(false);
let selectedTablePackageId = $state('');

let quantities = $state<Record<string, number>>({});

	const subtotalCents = $derived.by(() => {
		if (!eventRecord) {
			return 0;
		}

		return eventRecord.ticketTiers.reduce((total, tier) => {
			const quantity = quantities[tier.id] ?? 0;
			return total + tier.priceCents * quantity;
		}, 0);
	});

	const selectedTicketCount = $derived.by(() => {
		if (!eventRecord) {
			return 0;
		}

		return eventRecord.ticketTiers.reduce((count, tier) => count + (quantities[tier.id] ?? 0), 0);
	});

	const directionsHref = $derived.by(() => {
		const address = eventRecord?.addressLine?.trim() ?? '';
		if (!address) {
			return '';
		}

		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
	});

	const mapEmbedSrc = $derived.by(() => {
		const address = eventRecord?.addressLine?.trim() ?? '';
		if (!address) {
			return '';
		}

		return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
	});

const tableBookingClosed = $derived.by(() => {
		if (!eventRecord) {
			return false;
		}

		const eventEnd = new Date(eventRecord.endAt).getTime();
	return Number.isFinite(eventEnd) ? eventEnd < Date.now() : false;
});

const isTablePackagesEvent = $derived.by(() => eventRecord?.salesMode === 'table-packages');

const eventTablePackages = $derived.by(() => eventRecord?.tablePackages ?? []);

const selectedTablePackage = $derived.by(() => {
	if (!selectedTablePackageId || eventTablePackages.length === 0) {
		return null;
	}

	return (
		eventTablePackages.find(
			(tablePackage: EventTablePackage) => tablePackage.id === selectedTablePackageId
		) ?? null
	);
});

	const moreEvents = $derived.by(() =>
		relatedCatalog
			.filter((candidate) => candidate.id !== eventId)
			.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
			.slice(0, 3)
	);

	function startDate(): Date | null {
		return eventRecord ? new Date(eventRecord.startAt) : null;
	}

	function endDate(): Date | null {
		return eventRecord ? new Date(eventRecord.endAt) : null;
	}

	function eventDateLine(): string {
		const start = startDate();
		const end = endDate();
		if (!start || !end) {
			return '';
		}

		return `${dateLineFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function eventDayLine(): string {
		const start = startDate();
		if (!start) {
			return '';
		}

		return dateLineFormatter.format(start);
	}

	function eventTimeLine(): string {
		const start = startDate();
		const end = endDate();
		if (!start || !end) {
			return '';
		}

		return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
	}

	function formatPrice(cents: number): string {
		return currencyFormatter.format(cents / 100);
	}

function eventPriceFrom(event: EventCatalogItem): string {
	if (event.salesMode === 'table-packages') {
		if (event.tablePackages && event.tablePackages.length > 0) {
			const minSpendCents = Math.min(...event.tablePackages.map((tablePackage) => tablePackage.minSpendCents));
			return `${formatPrice(minSpendCents)} min`;
		}
		if (event.ticketTiers.length > 0) {
			const minDepositCents = Math.min(...event.ticketTiers.map((tier) => tier.priceCents));
			return `${formatPrice(minDepositCents)} deposit`;
		}
		return 'Info soon';
	}

	if (event.ticketTiers.length === 0) {
		return 'Info soon';
	}
	const minCents = Math.min(...event.ticketTiers.map((tier) => tier.priceCents));
	return `${formatPrice(minCents)}+`;
}

function eventCardActionLabel(event: EventCatalogItem): string {
	return event.salesMode === 'table-packages' ? 'View Packages' : 'Get Tickets';
}

	function shortDateLineForEvent(event: EventCatalogItem): string {
		const start = new Date(event.startAt);
		return `${shortDateFormatter.format(start).toUpperCase()} - ${timeFormatter.format(start)}`;
	}

	function quantityOptions(maxPerOrder: number): number[] {
		return Array.from({ length: maxPerOrder + 1 }, (_, index) => index);
	}

	function updateTicketQuantity(tierId: string, value: string | number): void {
		const parsed = Number(value);
		const tier = eventRecord?.ticketTiers.find((candidate) => candidate.id === tierId);
		const maxPerOrder = tier?.maxPerOrder ?? 0;
		const safeValue = Number.isFinite(parsed)
			? Math.min(maxPerOrder, Math.max(0, Math.floor(parsed)))
			: 0;
		quantities = {
			...quantities,
			[tierId]: safeValue
		};
	}

	async function handleRequestTable(): Promise<void> {
		if (!eventRecord) {
			return;
		}
		if (tableBookingClosed) {
			pushToast({
				title: 'Requests closed',
				description: 'This event has ended. Table requests are closed.',
				variant: 'default'
			});
			return;
		}

		await goto(`/event/${eventRecord.id}/request-table`);
	}

	function openTablePackageModal(packageId: string): void {
		if (tableBookingClosed) {
			return;
		}

		selectedTablePackageId = packageId;
		tablePackageModalOpen = true;
	}

	function openPurchaseModal(): void {
		if (selectedTicketCount === 0) {
			pushToast({
				title: 'Select tickets',
				description: 'Choose at least one ticket before checkout.',
				variant: 'default'
			});
			return;
		}
		purchaseModalOpen = true;
	}

	function handlePurchaseSuccess(purchaseId: string): void {
		void purchaseId;
		purchaseModalOpen = false;
		quantities = {};

		pushToast({
			title: 'Tickets confirmed!',
			description: 'View your tickets in the Events page.',
			variant: 'success',
			action: {
				label: 'View tickets',
				onClick: () => {
					void goto('/event?tab=tickets');
				}
			}
		});
	}

	async function handleTablePackageCheckoutSuccess(purchaseId: string): Promise<void> {
		void purchaseId;
		if (!eventRecord || !selectedTablePackage) {
			return;
		}

		tablePackageModalOpen = false;
		const params = new URLSearchParams({
			eventId: eventRecord.id,
			clubName: eventRecord.venue,
			startAt: eventRecord.startAt,
			tableType: selectedTablePackage.sectionLabel,
			notes: `${eventRecord.title} - ${selectedTablePackage.sectionLabel}`,
			dressCode: eventRecord.dressCode,
			capacity: String(selectedTablePackage.capacity)
		});
		await goto(`/create?${params.toString()}`);
	}

	async function loadEventPageData(id: string): Promise<void> {
		loadingEvent = true;
		try {
			const [eventResult, catalogResult] = await Promise.allSettled([
				getPublishedEventById(id),
				listPublishedEvents()
			]);

			eventRecord = eventResult.status === 'fulfilled' ? eventResult.value : null;
			relatedCatalog = catalogResult.status === 'fulfilled' ? catalogResult.value : [];
		} catch {
			eventRecord = null;
			relatedCatalog = [];
		} finally {
			loadingEvent = false;
		}
	}

	onMount(async () => {
		await waitForAuthReady();
	});

	$effect(() => {
		if (!eventId) {
			eventRecord = null;
			relatedCatalog = [];
			loadingEvent = false;
			quantities = {};
			purchaseModalOpen = false;
			selectedTablePackageId = '';
			tablePackageModalOpen = false;
			return;
		}

		quantities = {};
		purchaseModalOpen = false;
		selectedTablePackageId = '';
		tablePackageModalOpen = false;
		void loadEventPageData(eventId);
	});
</script>

<div class="-mb-16 relative flex min-h-screen flex-col overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div
		class="pointer-events-none fixed inset-0 bg-[radial-gradient(55rem_38rem_at_-10%_-8%,rgb(168_85_247_/_0.22),transparent_55%),radial-gradient(48rem_28rem_at_95%_12%,rgb(34_211_238_/_0.12),transparent_55%),linear-gradient(180deg,#0a0a0f_0%,#0e0512_42%,#050507_100%)]"
	></div>

	<main class="relative z-10 flex min-h-screen flex-1 flex-col">
		<AppHeader />

		{#if loadingEvent}
			<section class="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
					<p class="font-semibold text-white">Loading event...</p>
				</div>
			</section>
		{:else if !eventRecord}
			<section class="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-zinc-300">
					<p class="font-semibold text-white">Event not found.</p>
					<p class="mt-1 text-sm">This event may have moved or is no longer available.</p>
					<a href="/event" class="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white">
						Back to events
					</a>
				</div>
			</section>
		{:else}
			<section class="relative h-[360px] overflow-hidden border-b border-zinc-800 sm:h-[420px] lg:h-[500px]">
				{#if eventRecord.posterImageUrl}
					<img
						src={eventRecord.posterImageUrl}
						alt={`Poster for ${eventRecord.title}`}
						class="absolute inset-0 h-full w-full object-cover"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<div class={`absolute inset-0 ${eventRecord.posterClass}`}></div>
				{/if}
				<div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,7,0.15)_0%,rgba(5,5,7,0.74)_58%,rgba(5,5,7,0.98)_100%)]"></div>
				<div class="absolute inset-x-0 bottom-0">
					<div class="mx-auto w-full max-w-[1440px] px-5 pb-6 sm:px-8 sm:pb-8 lg:px-12 lg:pb-10">
						<p class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-violet-100" style="font-family: 'Space Mono', monospace;">
							<Sparkles class="h-3.5 w-3.5" />
							Live event
						</p>
						<h1 class="mt-3 text-4xl font-extrabold uppercase leading-[0.9] tracking-tight text-white sm:text-5xl lg:text-6xl" style="font-family: 'Space Grotesk', sans-serif;">
							{eventRecord.posterHeadline}
						</h1>
						<p class="mt-2 text-sm text-zinc-200 sm:text-base">{eventRecord.title}</p>
						<div class="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-200 sm:text-sm">
							<span class="inline-flex items-center gap-1.5">
								<Calendar class="h-4 w-4" />
								{eventDayLine()}
							</span>
							<span class="inline-flex items-center gap-1.5">
								<Clock3 class="h-4 w-4" />
								{eventTimeLine()}
							</span>
							<span class="inline-flex items-center gap-1.5">
								<MapPinned class="h-4 w-4" />
								{eventRecord.venue}
							</span>
						</div>
					</div>
				</div>
			</section>

			<section class="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
				<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
					<div class="order-2 space-y-5 lg:order-1">
						<section class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4 sm:p-5">
							<p class="text-[11px] uppercase tracking-[0.14em] text-violet-300" style="font-family: 'Space Mono', monospace;">About</p>
							<p class="mt-3 text-sm leading-6 text-zinc-300">
								{eventRecord.description}
							</p>
							<p class="mt-3 text-xs text-zinc-500">
								By joining this event or booking a table, you agree to receive event updates related to
								access, entry, and operational changes.
							</p>
						</section>

						<section class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4 sm:p-5">
							{#if isTablePackagesEvent}
								<p class="text-[11px] uppercase tracking-[0.14em] text-violet-300" style="font-family: 'Space Mono', monospace;">
									{eventRecord.packageDetails?.heading ?? 'VIP Table Details'}
								</p>
								{#if eventRecord.packageDetails?.summary}
									<p class="mt-3 text-base font-semibold text-white">{eventRecord.packageDetails.summary}</p>
								{/if}
								{#if eventRecord.packageDetails?.intro}
									<p class="mt-3 text-sm leading-6 text-zinc-300">{eventRecord.packageDetails.intro}</p>
								{/if}
								{#if eventRecord.packageDetails?.inclusions && eventRecord.packageDetails.inclusions.length > 0}
									<div class="mt-3 space-y-2">
										{#each eventRecord.packageDetails.inclusions as inclusion (inclusion)}
											<p class="text-sm text-zinc-300">{inclusion}</p>
										{/each}
									</div>
								{/if}
								{#if eventRecord.packageDetails?.policy}
									<p class="mt-4 text-sm text-zinc-300">{eventRecord.packageDetails.policy}</p>
								{/if}
								{#if eventRecord.packageDetails?.capacityNote}
									<p class="mt-3 text-sm text-zinc-300">{eventRecord.packageDetails.capacityNote}</p>
								{/if}
								{#if eventRecord.packageDetails?.contactEmail}
									<p class="mt-4 text-sm text-zinc-200">
										For more information please contact
										<a
											class="font-semibold text-cyan-300 transition hover:text-cyan-200"
											href={`mailto:${eventRecord.packageDetails.contactEmail}`}
										>
											{eventRecord.packageDetails.contactEmail}
										</a>
									</p>
								{/if}
								{#if eventRecord.packageDetails?.infoUrl}
									<p class="mt-3 text-sm">
										<a
											class="font-semibold text-cyan-300 transition hover:text-cyan-200"
											href={eventRecord.packageDetails.infoUrl}
											target="_blank"
											rel="noopener noreferrer"
										>
											{eventRecord.packageDetails.infoUrl}
										</a>
									</p>
								{/if}
							{:else}
								<p class="text-[11px] uppercase tracking-[0.14em] text-violet-300" style="font-family: 'Space Mono', monospace;">Admission</p>
								<div class="mt-3 space-y-2">
									{#if eventRecord.ticketTiers.length === 0}
										<div class="rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
											<p class="text-sm font-semibold text-white">Ticket info coming soon</p>
											<p class="text-xs text-zinc-400">Check back later for published ticket tiers.</p>
										</div>
									{:else}
										{#each eventRecord.ticketTiers as tier (tier.id)}
											<div class="flex items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
												<div>
													<p class="text-sm font-semibold text-white">{tier.label}</p>
													<p class="text-xs text-zinc-400">Max {tier.maxPerOrder} per order</p>
												</div>
												<p class="text-sm font-semibold text-lime-300" style="font-family: 'Space Mono', monospace;">
													{formatPrice(tier.priceCents)}
												</p>
											</div>
										{/each}
									{/if}
								</div>
							{/if}
						</section>

						<section class="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4 sm:p-5">
							<p class="text-[11px] uppercase tracking-[0.14em] text-violet-300" style="font-family: 'Space Mono', monospace;">Event details</p>
							<div class="mt-3 grid gap-3 sm:grid-cols-2">
								<article class="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4">
									<Zap class="h-5 w-5 text-cyan-300" />
									<p class="mt-2 text-base font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">Venue</p>
									<p class="mt-1 text-sm text-zinc-300">{eventRecord.venue}</p>
									<p class="mt-1 text-xs text-zinc-400">{eventRecord.location}</p>
								</article>
								<article class="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4">
									<Users class="h-5 w-5 text-cyan-300" />
									<p class="mt-2 text-base font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">Dress code</p>
									<p class="mt-1 text-sm text-zinc-300">{eventRecord.dressCode}</p>
									<p class="mt-1 text-xs text-zinc-400">{eventRecord.defaultTableType}</p>
								</article>
							</div>
							<div class="mt-3 space-y-2 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
								<p class="inline-flex items-center gap-2 text-sm text-zinc-300">
									<Clock3 class="h-4 w-4 text-zinc-400" />
									Start {timeFormatter.format(new Date(eventRecord.startAt))} - End {timeFormatter.format(new Date(eventRecord.endAt))}
								</p>
								<p class="inline-flex items-center gap-2 text-sm text-zinc-300">
									<Users class="h-4 w-4 text-zinc-400" />
									Table option: {eventRecord.defaultTableType}
								</p>
								{#if isTablePackagesEvent}
									<p class="inline-flex items-center gap-2 text-sm text-zinc-300">
										<Ticket class="h-4 w-4 text-zinc-400" />
										{eventTablePackages.length} table package{eventTablePackages.length === 1 ? '' : 's'}
									</p>
								{:else}
									<p class="inline-flex items-center gap-2 text-sm text-zinc-300">
										<Ticket class="h-4 w-4 text-zinc-400" />
										{eventRecord.ticketTiers.length} ticket tier{eventRecord.ticketTiers.length === 1 ? '' : 's'}
									</p>
								{/if}
							</div>
						</section>
					</div>

					<aside class="order-1 space-y-5 lg:order-2">
						<section class="rounded-2xl border border-zinc-800 bg-zinc-900/88 p-4 sm:p-5">
							{#if isTablePackagesEvent}
								<div class="flex items-center justify-between gap-3">
									<p class="text-xl font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Select a Table Package</p>
									<span class="inline-flex items-center rounded-full bg-lime-300/15 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-lime-300" style="font-family: 'Space Mono', monospace;">
										{eventTablePackages.length} available
									</span>
								</div>
								<div class="mt-4 space-y-3">
									{#if eventTablePackages.length === 0}
										<div class="rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
											<p class="text-sm font-semibold text-white">No packages available yet</p>
											<p class="text-xs text-zinc-400">Please check back shortly for package availability.</p>
										</div>
									{:else}
										{#each eventTablePackages as tablePackage (tablePackage.id)}
											<div
												class={`rounded-xl border bg-zinc-950/60 p-3 transition ${
													selectedTablePackageId === tablePackage.id
														? 'border-violet-500/55 shadow-[0_0_14px_rgba(168,85,247,0.18)]'
														: 'border-zinc-700'
												}`}
											>
												<div class="flex items-start justify-between gap-3">
													<div>
														<p class="text-base font-semibold text-white">{tablePackage.capacity} Guests</p>
														<p class="text-sm text-zinc-300">{tablePackage.sectionLabel}</p>
														<div class="mt-2 flex flex-wrap items-center gap-1.5">
															<span class="inline-flex h-6 items-center rounded border border-cyan-500/60 bg-cyan-500/10 px-2 text-[11px] font-semibold text-cyan-200" style="font-family: 'Space Mono', monospace;">
																{formatPrice(tablePackage.minSpendCents)} Min
															</span>
															<span class="inline-flex h-6 items-center rounded border border-cyan-500/60 bg-cyan-500/10 px-2 text-[11px] font-semibold text-cyan-200" style="font-family: 'Space Mono', monospace;">
																{formatPrice(tablePackage.depositCents)} Deposit
															</span>
														</div>
													</div>
													<button
														type="button"
														class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-sm font-semibold text-white shadow-[0_0_18px_rgba(168,85,247,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
														onclick={() => openTablePackageModal(tablePackage.id)}
														disabled={tableBookingClosed}
													>
														Select
													</button>
												</div>
											</div>
										{/each}
									{/if}
								</div>
								{#if tableBookingClosed}
									<p class="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" aria-live="polite">
										This event has ended. Package checkout is closed.
									</p>
								{/if}
								<div class="mt-4 border-t border-zinc-700 pt-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-base font-semibold text-white">Don't see what you're looking for?</p>
											<p class="text-sm text-zinc-400">Send us a custom table request.</p>
										</div>
										<button
											type="button"
											class="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-800 px-4 text-sm font-semibold text-zinc-100 transition hover:border-cyan-400/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
											onclick={handleRequestTable}
											disabled={tableBookingClosed}
										>
											{tableBookingClosed ? 'Closed' : 'Request'}
										</button>
									</div>
								</div>
							{:else}
								<div class="flex items-center justify-between gap-3">
									<p class="text-xl font-bold text-white" style="font-family: 'Space Grotesk', sans-serif;">Select Tickets</p>
									<span class="inline-flex items-center rounded-full bg-lime-300/15 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-lime-300" style="font-family: 'Space Mono', monospace;">
										{selectedTicketCount} selected
									</span>
								</div>
								<div class="mt-4 space-y-3">
									{#each eventRecord.ticketTiers as tier (tier.id)}
										<div
											class={`relative z-0 flex items-center justify-between gap-3 rounded-xl border px-3 py-3 backdrop-blur-sm transition-all duration-200 focus-within:z-20 ${
												(quantities[tier.id] ?? 0) > 0
													? 'border-violet-500/45 bg-violet-500/12 shadow-[0_0_14px_rgba(168,85,247,0.2)]'
													: 'border-zinc-700 bg-zinc-950/45'
											}`}
										>
											<div>
												<p class="text-sm font-semibold text-white">{tier.label}</p>
												<p class="text-xs text-zinc-400">{formatPrice(tier.priceCents)}</p>
											</div>
											<div class="flex items-center gap-3">
												<p class="text-sm font-semibold text-white">{formatPrice(tier.priceCents)}</p>
												<QuantitySelect
													ariaLabel={`Select ${tier.label} quantity`}
													options={quantityOptions(tier.maxPerOrder)}
													value={quantities[tier.id] ?? 0}
													on:change={(event) => updateTicketQuantity(tier.id, event.detail.value)}
												/>
											</div>
										</div>
									{/each}
								</div>
								<div class="mt-4 flex items-center justify-between text-sm">
									<p class="text-zinc-400">Subtotal</p>
									<p class="font-semibold text-white">{formatPrice(subtotalCents)}</p>
								</div>
								{#if tableBookingClosed}
									<p class="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" aria-live="polite">
										This event has ended. Ticket sales are closed.
									</p>
								{/if}
								<button
									type="button"
									class={`mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-bold transition ${
										selectedTicketCount > 0
											? 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-[0_0_24px_rgba(168,85,247,0.35)] hover:brightness-110'
											: 'border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-cyan-400/45'
									} ${tableBookingClosed ? 'cursor-not-allowed opacity-60' : ''}`}
									onclick={openPurchaseModal}
									disabled={tableBookingClosed}
								>
									{#if tableBookingClosed}
										Sales closed
									{:else if selectedTicketCount > 0}
										Buy Tickets - {formatPrice(subtotalCents)}
									{:else}
										Buy Tickets
									{/if}
								</button>
								<button
									type="button"
									class="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
									onclick={handleRequestTable}
									disabled={tableBookingClosed}
								>
									{tableBookingClosed ? 'Requests closed' : 'Request Table'}
								</button>
							{/if}
						</section>

						<section class="rounded-2xl border border-zinc-800 bg-zinc-900/88 p-4">
							<p class="text-[11px] uppercase tracking-[0.14em] text-violet-300" style="font-family: 'Space Mono', monospace;">Venue</p>
							{#if mapEmbedSrc}
								<div class="relative mt-3 h-36 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/40">
									<iframe
										title={`Map for ${eventRecord.venue}`}
										src={mapEmbedSrc}
										loading="lazy"
										referrerpolicy="no-referrer-when-downgrade"
										class="h-full w-full border-0"
										style="filter: grayscale(1) invert(0.92) hue-rotate(180deg) contrast(0.95) brightness(0.82);"
									></iframe>
									<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,7,0.16)_0%,rgba(5,5,7,0.32)_100%)]"></div>
								</div>
							{:else}
								<div class="mt-3 h-36 overflow-hidden rounded-xl border border-zinc-700 bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,0.22),transparent_60%),linear-gradient(180deg,#14141a_0%,#0f0f14_100%)]">
									<div class="flex h-full items-center justify-center">
										<MapPinned class="h-10 w-10 text-rose-400" />
									</div>
								</div>
							{/if}
							<p class="mt-3 text-base font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">{eventRecord.venue}</p>
							<p class="mt-1 text-xs text-zinc-400">{eventRecord.addressLine}</p>
							{#if directionsHref}
								<a
									href={directionsHref}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/45 hover:text-white"
									aria-label={`Get directions to ${eventRecord.venue}`}
								>
									Open map
								</a>
							{:else}
								<button type="button" class="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-500" disabled>
									Address unavailable
								</button>
							{/if}
						</section>
					</aside>
				</div>

				{#if moreEvents.length > 0}
					<section class="mt-8 space-y-3">
						<div class="flex items-center justify-between gap-3">
							<p class="text-lg font-semibold text-white" style="font-family: 'Space Grotesk', sans-serif;">More Events You'll Love</p>
							<a href="/event" class="text-xs font-semibold uppercase tracking-[0.08em] text-violet-300 transition hover:text-violet-200">
								View all
							</a>
						</div>
						<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{#each moreEvents as item (item.id)}
								<a href={`/event/${item.id}`} class="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-0.5 hover:border-violet-500/55">
									<div class="relative h-44 overflow-hidden">
										{#if item.posterImageUrl}
											<img src={item.posterImageUrl} alt={`Poster for ${item.title}`} class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" decoding="async" />
										{:else}
											<div class={`h-full w-full ${item.posterClass}`}></div>
										{/if}
										<div class="absolute inset-0 bg-gradient-to-b from-black/5 via-black/35 to-black/90"></div>
									</div>
									<div class="space-y-2 p-3">
										<p class="text-[11px] uppercase tracking-[0.08em] text-zinc-400" style="font-family: 'Space Mono', monospace;">{shortDateLineForEvent(item)}</p>
										<p class="text-base font-semibold text-white">{item.title}</p>
										<p class="text-xs text-zinc-400">{item.venue}</p>
										<div class="flex items-center justify-between pt-1">
											<span class="text-xs text-lime-300" style="font-family: 'Space Mono', monospace;">{eventPriceFrom(item)}</span>
											<span class="inline-flex h-8 items-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-3 text-xs font-bold text-white">{eventCardActionLabel(item)}</span>
										</div>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}
			</section>
		{/if}
	</main>

	<footer class="relative z-10 mt-2 w-full border-t border-zinc-800 bg-[#0e0e12]">
		<div class="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-8 text-zinc-300 sm:px-8 lg:px-12">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-lg font-extrabold uppercase text-white" style="font-family: 'Space Grotesk', sans-serif;">Apollo HQ</p>
					<p class="text-sm text-zinc-400">Your gateway to underground nights and hosted experiences.</p>
				</div>
			</div>
			<div class="flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
				<p class="text-sm text-zinc-300">Stay in the loop when newly published events drop.</p>
				<a href="/event" class="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-3 text-xs font-bold text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]">Browse Events</a>
			</div>
			<div class="flex flex-col gap-2 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
				<span>(c) 2026 Apollo HQ. All rights reserved.</span>
			</div>
		</div>
	</footer>
</div>

{#if eventRecord && !isTablePackagesEvent}
	<PurchaseModal
		open={purchaseModalOpen}
		event={eventRecord}
		{quantities}
		onClose={() => {
			purchaseModalOpen = false;
		}}
		onSuccess={handlePurchaseSuccess}
	/>
{/if}

{#if eventRecord && isTablePackagesEvent}
	<TablePackageModal
		open={tablePackageModalOpen}
		event={eventRecord}
		tablePackage={selectedTablePackage}
		onClose={() => {
			tablePackageModalOpen = false;
		}}
		onSuccess={handleTablePackageCheckoutSuccess}
	/>
{/if}
