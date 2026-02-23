<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import ToastViewport from '$lib/components/common/toast-viewport.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta
		name="description"
		content="Nightclub table reservations, guestlist, and loyalty-ready check-in in one premium flow."
	/>
</svelte:head>

<div class="min-h-screen pb-16">
	{@render children()}
</div>

<ToastViewport />
