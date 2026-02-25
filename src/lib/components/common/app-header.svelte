<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { currentUser, signOutCurrentUser } from '$lib/firebase/auth';
	import BrandMark from '$lib/components/common/brand-mark.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { cn } from '$lib/utils/cn';

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

<header class="app-shell motion-enter pt-4 sm:pt-6">
	<div class="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
		<a class="inline-flex items-center gap-2 text-foreground no-underline" href="/">
			<BrandMark class="h-4 w-4" />
			<span class={compact ? 'hidden text-sm font-semibold sm:inline' : 'text-sm font-semibold'}>
				Nightclub Guestlist
			</span>
		</a>

		<div class="flex items-center gap-2">
			{#if $currentUser}
				<a class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))} href="/host/events">My events</a>
				<Button variant="outline" size="sm" onclick={handleSignOut}>Sign out</Button>
			{:else}
				<Button variant="outline" size="sm" onclick={handleSignIn}>Sign in</Button>
			{/if}
		</div>
	</div>
</header>
