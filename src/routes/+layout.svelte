<script lang="ts">
import favicon from '$lib/assets/favicon.svg';
import '../app.css';
import ToastViewport from '$lib/components/common/toast-viewport.svelte';
import AuthModal from '$lib/components/common/auth-modal.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700;800&family=Space+Mono:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<meta
		name="description"
		content="Nightclub table reservations, guestlist, and loyalty-ready check-in in one premium flow."
	/>
</svelte:head>

<div class="min-h-screen pb-16">
	{@render children()}
</div>

<AuthModal />
<ToastViewport />
