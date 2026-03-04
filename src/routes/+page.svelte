<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowRight } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';

	onMount(() => {
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = ''; };
	});
</script>

<div class="relative flex h-dvh flex-col overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div class="pointer-events-none absolute inset-0 bg-[url('/images/landing-minimal-bg.png')] bg-cover bg-center opacity-70"></div>
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(77,171,254,0.22),transparent_36%),radial-gradient(circle_at_50%_72%,rgba(5,5,7,0.94),rgba(5,5,7,1)_74%),linear-gradient(180deg,rgba(5,5,7,0.2)_0%,rgba(5,5,7,0.82)_58%,#050507_100%)]"
	></div>
	<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,7,0.62)_0%,rgba(5,5,7,0.1)_50%,rgba(5,5,7,0.62)_100%)]"></div>

	<div class="relative z-20">
		<AppHeader />
	</div>

	<main class="relative z-10 mx-auto flex w-full flex-1 items-center justify-center px-5 sm:px-8 lg:px-12">
			<div class="flex w-full max-w-[900px] flex-col items-center text-center">
				<div class="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400"></span>
					<span class="text-[11px] uppercase tracking-[0.12em] text-blue-300" style="font-family: 'Space Mono', monospace;">
						the best nightlife in america
					</span>
				</div>

				<h1 class="mt-8 max-w-[820px] text-6xl font-black uppercase leading-none tracking-tight text-white sm:text-7xl lg:text-8xl" style="font-family: 'Manrope', sans-serif; text-shadow: 0 12px 40px rgba(0,0,0,0.6);">
					Your night starts here
				</h1>

				<p class="mt-5 max-w-[480px] text-sm text-zinc-500">
					Curated events, reserved tables, and instant access — wherever the night takes you.
				</p>

				<div class="mt-9">
					<a
						href="/event"
						class="group relative inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800 px-10 text-base font-bold uppercase tracking-widest text-white shadow-[0_0_40px_rgba(77,171,254,0.55),0_0_80px_rgba(77,171,254,0.2)] transition duration-300 hover:scale-[1.04] hover:shadow-[0_0_60px_rgba(77,171,254,0.75),0_0_120px_rgba(77,171,254,0.3)]"
						style="font-family: 'Manrope', sans-serif;"
					>
						<span class="relative z-10">Explore Events</span>
						<ArrowRight class="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
						<span class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"></span>
					</a>
				</div>
			</div>
	</main>
</div>
