<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { currentUser, signOutCurrentUser } from '$lib/firebase/auth';
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

<header class="relative z-20 border-b border-zinc-800 bg-black/60 backdrop-blur">
	<div class={`mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 ${compact ? 'px-4 py-2.5 sm:px-6 lg:px-10' : 'px-5 py-3 sm:px-8 lg:px-12'}`}>
		<div class="flex min-w-0 items-center gap-3">
			<a href="/event" class="inline-flex min-w-0 items-center gap-2 text-base font-extrabold uppercase text-white no-underline sm:text-lg">
				<BrandMark class="h-4 w-4 shrink-0" />
				<span class="font-display truncate leading-none">NIGHTCLUB GUESTLIST</span>
			</a>
		</div>

		<div class="flex items-center gap-2">
			<a href="/event" class="inline-flex h-8 items-center rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-semibold text-zinc-300 transition hover:border-violet-500/60 hover:text-white">
				View events
			</a>
			{#if $currentUser}
				<button type="button" class="h-8 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-semibold text-zinc-300 transition hover:border-violet-500/60 hover:text-white" onclick={handleSignOut}>
					Sign out
				</button>
			{:else}
				<button type="button" class="h-8 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-semibold text-zinc-300 transition hover:border-violet-500/60 hover:text-white" onclick={handleSignIn}>
					Sign in
				</button>
			{/if}
		</div>
	</div>
</header>
