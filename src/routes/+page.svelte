<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import AppHeader from '$lib/components/common/app-header.svelte';
</script>

<div class="relative min-h-screen overflow-hidden bg-[#050507] text-white" style="font-family: 'Manrope', sans-serif;">
	<div class="pointer-events-none absolute inset-0 bg-[url('/images/landing-minimal-bg.png')] bg-cover bg-center opacity-70"></div>
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.22),transparent_36%),radial-gradient(circle_at_50%_72%,rgba(5,5,7,0.94),rgba(5,5,7,1)_74%),linear-gradient(180deg,rgba(5,5,7,0.2)_0%,rgba(5,5,7,0.82)_58%,#050507_100%)]"
	></div>
	<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,7,0.62)_0%,rgba(5,5,7,0.1)_50%,rgba(5,5,7,0.62)_100%)]"></div>

	<div class="relative z-20">
		<AppHeader />
	</div>

	<main class="relative z-10 mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-[1440px] items-center justify-center px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
		<section class="flex w-full max-w-[980px] flex-col items-center text-center">
			<div class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2">
				<span class="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
				<span class="text-[11px] uppercase tracking-[0.12em] text-violet-300" style="font-family: 'Space Mono', monospace;">
					BROOKLYN'S #1 NIGHTLIFE PLATFORM
				</span>
			</div>

			<h1 class="mt-6 text-5xl font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white sm:text-6xl lg:text-8xl" style="font-family: 'Space Grotesk', sans-serif; text-shadow: 0 12px 34px rgba(0,0,0,0.5);">
				<span class="block">YOUR NEXT</span>
				<span class="block">UNFORGETTABLE</span>
				<span class="block">NIGHT STARTS HERE</span>
			</h1>

			<p class="mt-5 max-w-[660px] text-base text-zinc-300 sm:text-lg">
				Discover events, book tables, and skip the line.
			</p>

			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				<a
					href="/event"
					class="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-6 text-sm font-bold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)] transition hover:brightness-110"
					style="font-family: 'Space Grotesk', sans-serif;"
				>
					Explore Events
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>
		</section>
	</main>
</div>
