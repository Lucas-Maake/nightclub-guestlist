<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { parseReturnTo } from '$lib/firebase/auth';
	import { openAuthModal } from '$lib/stores/auth-modal';

	let statusMessage = $state('Opening sign-in...');

	onMount(async () => {
		const params = new URLSearchParams($page.url.search);
		const returnTo = parseReturnTo(params, '/');

		await goto('/', {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});

		statusMessage = 'Sign in has moved to the new modal.';
		await openAuthModal({ returnTo, source: 'legacy-login-route' });
	});
</script>

<main class="app-shell py-12 sm:py-16">
	<div class="mx-auto max-w-xl">
		<p class="state-panel-muted" aria-live="polite">{statusMessage}</p>
	</div>
</main>
