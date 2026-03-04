<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { authReady, currentUser, signOutCurrentUser } from '$lib/firebase/auth';
	import { openAuthModal } from '$lib/stores/auth-modal';

	type Props = {
		compact?: boolean;
	};

	let { compact = false }: Props = $props();

	async function handleSignOut(): Promise<void> {
		await signOutCurrentUser();
		await goto('/');
	}

	async function handleSignIn(): Promise<void> {
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

		<nav class="flex items-center gap-6">
			<a href="/event" class="text-sm font-medium text-zinc-400 no-underline transition-colors duration-150 hover:text-white">Browse</a>
			<a href="/host/events" class="text-sm font-medium text-zinc-400 no-underline transition-colors duration-150 hover:text-white">My Events</a>
			{#if $authReady}
				{#if $currentUser}
					<button type="button" class="text-sm font-medium text-zinc-500 transition-colors duration-150 hover:text-zinc-300" onclick={handleSignOut}>
						Sign out
					</button>
				{:else}
					<button type="button" class="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white backdrop-blur transition duration-150 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300" onclick={handleSignIn}>
						Sign in
					</button>
				{/if}
			{/if}
		</nav>
	</div>
</header>
