<script lang="ts">
	import { page } from '$app/stores';
	import { currentUser, signOutCurrentUser } from '$lib/firebase/auth';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { openAuthModal } from '$lib/stores/auth-modal';
	import { cn } from '$lib/utils/cn';
	import { initialsFromName } from '$lib/utils/format';

	type Props = {
		compact?: boolean;
	};

	let { compact = false }: Props = $props();

	async function handleSignOut(): Promise<void> {
		await signOutCurrentUser();
	}

	async function handleSignIn(): Promise<void> {
		const returnTo = `${$page.url.pathname}${$page.url.search}`;
		await openAuthModal({ returnTo, source: 'app-header' });
	}
</script>

<header class="app-shell motion-enter pt-4 sm:pt-6">
	<div class="flex items-center justify-between gap-3 rounded-2xl border border-border/75 bg-card/60 px-4 py-3 backdrop-blur-sm sm:px-5">
		<a class="inline-flex items-center gap-3" href="/">
			<span
				class="inline-flex h-9 w-9 items-center justify-center rounded-pill bg-primary/18 text-xs font-semibold uppercase tracking-[0.18em] text-primary"
			>
				NG
			</span>
			<div class={compact ? 'hidden sm:block' : 'block'}>
				<p class="text-sm font-semibold tracking-tight text-foreground">Nightclub Guestlist</p>
				<p class="text-xs text-muted-foreground">Reservation + Door Ops</p>
			</div>
		</a>

		<div class="flex items-center gap-2">
			{#if $currentUser}
				<span
					class="inline-flex h-9 min-w-9 items-center justify-center rounded-pill border border-border bg-secondary/60 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
				>
					{initialsFromName($currentUser.displayName ?? $currentUser.phoneNumber)}
				</span>
				<Button variant="outline" size="sm" onclick={handleSignOut}>Sign out</Button>
			{:else}
				<button
					type="button"
					class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
					onclick={handleSignIn}
				>
					Sign in
				</button>
			{/if}
		</div>
	</div>
</header>
