<script lang="ts">
	import { openAuthModal } from '$lib/stores/auth-modal';

	async function handleSignIn(): Promise<void> {
		await openAuthModal({ returnTo: '/event', source: 'home-cta' });
	}
</script>

<main class="app-shell py-12 sm:py-16 lg:py-20">
	<section class="surface p-6 sm:p-10 lg:p-14">
		<h1 class="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
			Discover upcoming nights and manage your active tables.
		</h1>
		<div class="mt-10 flex flex-wrap gap-3">
			<a
				class="inline-flex h-11 items-center rounded-pill border border-border bg-secondary/40 px-6 text-sm font-medium text-foreground transition-colors hover:bg-secondary/55"
				href="/event"
			>
				View events
			</a>
			<button
				type="button"
				class="inline-flex h-11 items-center rounded-pill bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				onclick={handleSignIn}
			>
				Sign in
			</button>
		</div>
	</section>
</main>
