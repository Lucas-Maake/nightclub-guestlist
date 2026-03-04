<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { fade, fly } from 'svelte/transition';
	import { Menu, X } from 'lucide-svelte';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { authReady, currentUser, signOutCurrentUser } from '$lib/firebase/auth';
	import { openAuthModal } from '$lib/stores/auth-modal';

	type Props = {
		compact?: boolean;
	};

	let { compact = false }: Props = $props();
	let mobileMenuOpen = $state(false);

	afterNavigate(() => {
		mobileMenuOpen = false;
	});

	async function handleSignOut(): Promise<void> {
		mobileMenuOpen = false;
		await signOutCurrentUser();
		await goto('/');
	}

	async function handleSignIn(): Promise<void> {
		mobileMenuOpen = false;
		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		await openAuthModal({ returnTo, source: 'app-header' });
	}
</script>

<header class="relative z-20 border-b border-white/[0.06] bg-black/40 backdrop-blur-xl">
	<div class={`mx-auto flex w-full max-w-[1440px] items-center justify-between ${compact ? 'px-4 py-3 sm:px-6 lg:px-10' : 'px-5 py-4 sm:px-8 lg:px-12'}`}>
		<a href="/" class="inline-flex items-center gap-2.5 no-underline">
			<BrandMark class="h-5 w-5 shrink-0" />
			<span class="text-sm font-black uppercase tracking-widest text-white" style="font-family: 'Manrope', sans-serif;">Apollo HQ</span>
		</a>

		<!-- Desktop nav -->
		<nav class="hidden items-center gap-6 sm:flex">
			{#if $authReady}
				<div in:fade={{ duration: 300 }} class="flex items-center gap-6">
					<a href="/event" class="text-sm font-medium text-zinc-400 no-underline transition-colors duration-150 hover:text-white">Browse</a>
					<a href="/host/events" class="text-sm font-medium text-zinc-400 no-underline transition-colors duration-150 hover:text-white">My Events</a>
					{#if $currentUser}
						<button type="button" class="text-sm font-medium text-zinc-500 transition-colors duration-150 hover:text-zinc-300" onclick={handleSignOut}>Sign out</button>
					{:else}
						<button type="button" class="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white backdrop-blur transition duration-150 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300" onclick={handleSignIn}>Sign in</button>
					{/if}
				</div>
			{/if}
		</nav>

		<!-- Mobile hamburger -->
		{#if $authReady}
			<div class="relative sm:hidden">
				<button
					type="button"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:text-white"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					aria-label="Toggle menu"
				>
					{#if mobileMenuOpen}
						<X class="h-5 w-5" />
					{:else}
						<Menu class="h-5 w-5" />
					{/if}
				</button>

				{#if mobileMenuOpen}
					<div
						in:fly={{ y: -6, duration: 180 }}
						class="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-white/[0.1] bg-[#1c1c23] shadow-2xl"
					>
						<nav class="flex flex-col p-1.5">
							<a href="/event" onclick={() => (mobileMenuOpen = false)} class="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-200 no-underline transition hover:bg-white/[0.07] hover:text-white">Browse</a>
							<a href="/host/events" onclick={() => (mobileMenuOpen = false)} class="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-200 no-underline transition hover:bg-white/[0.07] hover:text-white">My Events</a>
							<div class="my-1 h-px bg-white/[0.06]"></div>
							{#if $currentUser}
								<button type="button" class="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-200" onclick={handleSignOut}>Sign out</button>
							{:else}
								<button type="button" class="rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-white/[0.07]" onclick={handleSignIn}>Sign in</button>
							{/if}
						</nav>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</header>
